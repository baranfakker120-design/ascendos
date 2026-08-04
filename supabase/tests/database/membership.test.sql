-- ============================================================
-- Sprint 2a: Identitaet und Mitgliedschaft (pgTAP)
-- Prueft Migration 20260802000015_identity_and_membership.sql
--
-- Schwerpunkt: die Aufloesungsregel der aktiven Organisation aus
-- F2 Teil 1.3, insbesondere Fall 4 (Mehrdeutigkeit weist ab, raet nie),
-- und die Strukturregel aus F2 Teil 1.5 (Sponsor nur innerhalb
-- derselben Organisation).
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

-- ---------- Testumgebung: Trigger fuer den Auth-Insert umgehen ----------
-- Begruendung siehe function_security.test.sql. ALTER TABLE scheitert,
-- weil postgres nicht Eigentuemer von auth.users ist.
set local session_replication_role = replica;

insert into auth.users (id, email) values
  ('c5000000-0000-0000-0000-00000000000a', 's2-anna@test.local'),
  ('c5000000-0000-0000-0000-00000000000b', 's2-bert@test.local'),
  ('c5000000-0000-0000-0000-00000000000c', 's2-clara@test.local'),
  ('c5000000-0000-0000-0000-00000000000f', 's2-emil@test.local');

set local session_replication_role = origin;

insert into public.organizations (id, name) values
  ('a5000000-0000-0000-0000-000000000001', 'S2 TestOrg'),
  ('a5000000-0000-0000-0000-000000000002', 'S2 FremdOrg');

insert into public.teams (id, org_id, name) values
  ('b5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'S2 Team'),
  ('b5000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000002', 'S2 FremdTeam');

-- Struktur in S2 TestOrg:  Anna -> Bert -> Clara
-- Emil ist in S2 FremdOrg.
insert into public.profiles
  (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('c5000000-0000-0000-0000-00000000000a','a5000000-0000-0000-0000-000000000001',
   'b5000000-0000-0000-0000-000000000001', null,'super_admin','S2Anna','A','s2anna'),
  ('c5000000-0000-0000-0000-00000000000b','a5000000-0000-0000-0000-000000000001',
   'b5000000-0000-0000-0000-000000000001','c5000000-0000-0000-0000-00000000000a','berater','S2Bert','B','s2bert'),
  ('c5000000-0000-0000-0000-00000000000c','a5000000-0000-0000-0000-000000000001',
   'b5000000-0000-0000-0000-000000000001','c5000000-0000-0000-0000-00000000000b','berater','S2Clara','C','s2clara'),
  ('c5000000-0000-0000-0000-00000000000f','a5000000-0000-0000-0000-000000000002',
   'b5000000-0000-0000-0000-000000000002', null,'berater','S2Emil','E','s2emil');

-- Der Datenumzug aus Migration 15 lief bereits. Fuer die HIER neu
-- angelegten Profile muss er von Hand nachgezogen werden, weil er
-- einmalig in der Migration steht.
--
-- WICHTIG: unter session_replication_role = replica. Sonst loescht
-- sync_profile_mirror beim INSERT ohne Sponsor sofort profiles.sponsor_id,
-- und die Genealogie-Aktualisierung findet keinen Join-Partner mehr.
-- Ausserdem blockiert protect_membership_columns die Sponsor-Spalte
-- ohne Super-Admin-Sitzung.
set local session_replication_role = replica;
insert into public.memberships
  (identity_id, org_id, team_id, role, status)
select p.id, p.org_id, p.team_id, p.role, 'active'
from public.profiles p
where p.id::text like 'c5000000%'
  and not exists (select 1 from public.memberships m
                  where m.identity_id = p.id and m.org_id = p.org_id and m.status='active');

update public.memberships m
set sponsor_membership_id = sp.id
from public.profiles p
join public.memberships sp on sp.identity_id = p.sponsor_id and sp.org_id = p.org_id and sp.status='active'
where m.identity_id = p.id and m.org_id = p.org_id and m.status='active'
  and p.id::text like 'c5000000%' and p.sponsor_id is not null;
set local session_replication_role = origin;

create schema if not exists tests;

-- Ursache A aus Sprint 0: authenticated braucht USAGE, sonst scheitert
-- jeder zweite Rollenwechsel.
grant usage on schema tests to authenticated;

create or replace function tests.authenticate_as(user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

/** Setzt den Organisationsselektor, wie PostgREST ihn aus dem
 *  Anfragekopf x-ascendos-org bereitstellt. */
create or replace function tests.select_org(org uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.headers',
    json_build_object('x-ascendos-org', org::text)::text, true);
end;
$$;

create or replace function tests.clear_org()
returns void language plpgsql as $$
begin
  perform set_config('request.headers', '{}', true);
end;
$$;

/** SECURITY DEFINER: RLS on memberships hides cross-org rows from
 *  authenticated callers, which would turn sponsor-reassignment tests
 *  into silent no-ops (SET sponsor = NULL). */
create or replace function tests.membership_id(p_identity uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id from public.memberships m
  where m.identity_id = p_identity and m.status = 'active'
  order by m.created_at nulls last, m.id
  limit 1;
$$;

grant execute on function tests.membership_id(uuid) to authenticated;

-- ============================================================
-- A. Datenumzug
-- ============================================================

select is(
  (select count(*)::int from public.memberships m
   join public.profiles p on p.id = m.identity_id
   where p.id::text like 'c5000000%' and m.status = 'active'),
  4,
  'A1 Fuer jedes Profil existiert genau eine aktive Mitgliedschaft'
);

select is(
  (select sp.identity_id::text
   from public.memberships m
   join public.memberships sp on sp.id = m.sponsor_membership_id
   where m.identity_id = 'c5000000-0000-0000-0000-00000000000c'),
  'c5000000-0000-0000-0000-00000000000b',
  'A2 Genealogie wurde auf Mitgliedschaftsebene uebertragen (Clara -> Bert)'
);

-- ============================================================
-- B. Aufloesungsregel der aktiven Organisation, F2 Teil 1.3
-- ============================================================

select tests.authenticate_as('c5000000-0000-0000-0000-00000000000b'); -- Bert
select tests.clear_org();

select is(
  public.current_org_id()::text,
  'a5000000-0000-0000-0000-000000000001',
  'B1 Fall 3: genau eine aktive Mitgliedschaft, kein Selektor -> sie gilt'
);

select is(
  public.current_user_role(),
  'berater',
  'B2 Rolle kommt aus der Mitgliedschaft, nicht aus dem Profil'
);

-- Zweite Mitgliedschaft fuer Bert in der Fremdorganisation.
reset role;
insert into public.memberships (identity_id, org_id, team_id, role, status)
values ('c5000000-0000-0000-0000-00000000000b',
        'a5000000-0000-0000-0000-000000000002',
        'b5000000-0000-0000-0000-000000000002', 'berater', 'active');

select tests.authenticate_as('c5000000-0000-0000-0000-00000000000b');
select tests.clear_org();

select is(
  public.current_org_id(),
  null,
  'B3 Fall 4: zwei aktive Mitgliedschaften, kein Selektor -> ABWEISEN, nicht raten'
);

select tests.select_org('a5000000-0000-0000-0000-000000000002');

select is(
  public.current_org_id()::text,
  'a5000000-0000-0000-0000-000000000002',
  'B4 Fall 1: gueltiger Selektor waehlt die Mitgliedschaft'
);

select tests.select_org('a5000000-0000-0000-0000-000000000009');

select is(
  public.current_org_id(),
  null,
  'B5 Fall 2: Selektor zeigt auf eine fremde Organisation -> ABWEISEN'
);

-- Bert wieder auf eine Mitgliedschaft zuruecksetzen.
--
-- Diese Anweisung aendert `status`, und protect_membership_columns
-- schuetzt genau dieses Feld. Als Berater wuerde der Trigger werfen,
-- und als Anna greift die Policy nicht, weil Berts zweite
-- Mitgliedschaft in der FREMDEN Organisation liegt.
--
-- Es ist ein Aufbauschritt, keine geprueste Handlung. Daher werden die
-- Trigger fuer diese eine Anweisung stillgelegt, wie beim Auth-Insert
-- oben. Danach sofort zurueck, damit alle folgenden Pruefungen unter
-- vollstaendiger Durchsetzung laufen.
reset role;
set local session_replication_role = replica;
update public.memberships set status = 'ended', left_at = now()
where identity_id = 'c5000000-0000-0000-0000-00000000000b'
  and org_id = 'a5000000-0000-0000-0000-000000000002';
set local session_replication_role = origin;

select tests.authenticate_as('c5000000-0000-0000-0000-00000000000b');
select tests.clear_org();

select is(
  public.current_org_id()::text,
  'a5000000-0000-0000-0000-000000000001',
  'B6 Beendete Mitgliedschaft zaehlt nicht mehr, Fall 3 greift wieder'
);

-- ============================================================
-- C. Strukturregel: Sponsor nur innerhalb derselben Organisation
--
-- WICHTIG zur Rollenwahl: PostgreSQL feuert BEFORE-Trigger in
-- ALPHABETISCHER Reihenfolge des Triggernamens:
--   memberships_protect_columns
--   memberships_sponsor_same_org
--   memberships_updated_at
--
-- protect_columns feuert also ZUERST und wirft bei einem Nicht-Admin
-- 'koennen nicht selbst geaendert werden', bevor der Sponsor-Trigger
-- ueberhaupt laeuft. Ein Test als Berater wuerde deshalb die falsche
-- Meldung erhalten.
--
-- Ein Sponsorwechsel ist zudem fachlich eine Verwaltungshandlung.
-- Diese Pruefungen laufen daher als Anna (super_admin): protect_columns
-- verlaesst sich frueh, und der Sponsor-Trigger kommt zum Zug.
-- ============================================================

select tests.authenticate_as('c5000000-0000-0000-0000-00000000000a'); -- Anna, super_admin
select tests.clear_org();

select throws_like(
  $$ update public.memberships
     set sponsor_membership_id = tests.membership_id('c5000000-0000-0000-0000-00000000000f')
     where identity_id = 'c5000000-0000-0000-0000-00000000000c'
       and status = 'active' $$,
  '%selben Organisation%',
  'C1 Sponsor aus einer anderen Organisation wird abgewiesen'
);

select throws_like(
  $$ update public.memberships m
     set sponsor_membership_id = m.id
     where m.identity_id = 'c5000000-0000-0000-0000-00000000000c'
       and m.status = 'active' $$,
  '%eigener Sponsor%',
  'C2 Eine Mitgliedschaft kann nicht ihr eigener Sponsor sein'
);

-- C3 und C4 sind INSERTs. protect_membership_columns ist BEFORE UPDATE
-- und betrifft sie nicht. Sie laufen weiter als Anna, damit die Policy
-- memberships_admin_write greift.
select throws_ok(
  $$ insert into public.memberships (identity_id, org_id, team_id, role, status)
     values ('c5000000-0000-0000-0000-00000000000c',
             'a5000000-0000-0000-0000-000000000001',
             'b5000000-0000-0000-0000-000000000001', 'berater', 'active') $$,
  '23505',
  null,
  'C3 Zwei AKTIVE Mitgliedschaften in derselben Organisation sind ausgeschlossen'
);

select lives_ok(
  $$ insert into public.memberships (identity_id, org_id, team_id, role, status)
     values ('c5000000-0000-0000-0000-00000000000c',
             'a5000000-0000-0000-0000-000000000001',
             'b5000000-0000-0000-0000-000000000001', 'berater', 'ended') $$,
  'C4 Eine BEENDETE zweite Mitgliedschaft ist erlaubt (F2 FD-2, Wiedereintritt)'
);

-- ============================================================
-- D. Genealogie auf Mitgliedschaften
-- ============================================================

select tests.authenticate_as('c5000000-0000-0000-0000-00000000000a'); -- Anna
select tests.clear_org();

select ok(
  public.is_ancestor_of('c5000000-0000-0000-0000-00000000000c'),
  'D1 Anna ist Vorfahre von Clara ueber zwei Stufen'
);

select is(
  (select count(*)::int from public.get_downline('c5000000-0000-0000-0000-00000000000a')),
  2,
  'D2 get_downline liefert Bert und Clara'
);

select tests.authenticate_as('c5000000-0000-0000-0000-00000000000c'); -- Clara

select ok(
  not public.is_ancestor_of('c5000000-0000-0000-0000-00000000000a'),
  'D3 Richtung ist eindeutig: Clara ist kein Vorfahre von Anna'
);

select is(
  (select count(*)::int from public.get_downline('c5000000-0000-0000-0000-00000000000f')),
  0,
  'D4 Fremde Organisation liefert keine Downline'
);

-- ============================================================
-- E. Schutz der Mitgliedschaftsfelder
-- ============================================================

select tests.authenticate_as('c5000000-0000-0000-0000-00000000000b'); -- Bert, berater

select throws_like(
  $$ update public.memberships set role = 'super_admin'
     where identity_id = 'c5000000-0000-0000-0000-00000000000b' and status = 'active' $$,
  '%koennen nicht selbst geaendert werden%',
  'E1 Selbstbefoerderung auf Mitgliedschaftsebene wird abgewiesen'
);

-- ============================================================
-- F. Mandantengrenze
-- ============================================================

select tests.authenticate_as('c5000000-0000-0000-0000-00000000000f'); -- Emil, FremdOrg
select tests.clear_org();

select is(
  (select count(*)::int from public.memberships
   where org_id = 'a5000000-0000-0000-0000-000000000001'),
  0,
  'F1 Fremde Organisation sieht keine Mitgliedschaften der Testorganisation'
);

-- ============================================================
-- G. Spiegelsynchronisation, Migration 17
--
-- Richtung: memberships ist die Wahrheit, profiles folgt. Ohne den
-- Trigger driftet der Spiegel, sobald eine Rolle oder ein Team an der
-- Mitgliedschaft geaendert wird.
-- ============================================================

reset role;

-- Rolle an der MITGLIEDSCHAFT aendern. Der Spiegel muss folgen.
-- protect_membership_columns laesst das nur Super-Admins: Anna in
-- ihrer (eindeutigen) Org, Trigger bleiben aktiv fuer die Sync.
select tests.authenticate_as('c5000000-0000-0000-0000-00000000000a');
select tests.clear_org();

update public.memberships set role = 'admin'
where identity_id = 'c5000000-0000-0000-0000-00000000000b' and status = 'active';

select is(
  (select role from public.profiles where id = 'c5000000-0000-0000-0000-00000000000b'),
  'admin',
  'G1 Rollenaenderung an der Mitgliedschaft spiegelt sich in profiles'
);

update public.memberships set team_id = 'b5000000-0000-0000-0000-000000000001'
where identity_id = 'c5000000-0000-0000-0000-00000000000b' and status = 'active';

select is(
  (select team_id::text from public.profiles where id = 'c5000000-0000-0000-0000-00000000000b'),
  'b5000000-0000-0000-0000-000000000001',
  'G2 Teamaenderung spiegelt sich ebenfalls'
);

-- Der Schutz darf durch die Synchronisation NICHT aufgeweicht sein.
select tests.authenticate_as('c5000000-0000-0000-0000-00000000000c'); -- Clara, berater

select throws_like(
  $$ update public.profiles set role = 'super_admin'
     where id = 'c5000000-0000-0000-0000-00000000000c' $$,
  '%können nicht selbst geändert werden%',
  'G3 Selbstaenderung des Spiegels bleibt trotz Synchronisationsweiche verboten'
);

-- ============================================================
-- H. profiles_public ohne role, F2 Aenderung Ae2
-- ============================================================

reset role;

select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles_public'
     and column_name = 'role'),
  0,
  'H1 profiles_public hat keine Spalte role mehr'
);

select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name = 'firstline_journey_progress'
     and column_name in ('current_day','total_days','journey_title')),
  3,
  'H2 firstline_journey_progress hat current_day, total_days und journey_title behalten'
);

-- ============================================================

reset role;
select * from finish();
rollback;
