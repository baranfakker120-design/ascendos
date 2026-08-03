-- ============================================================
-- RLS-Tests (pgTAP) — Priorität 1 der Teststrategie (ADR-014).
-- Ausführen mit: npm run db:test  (supabase test db)
--
-- Simuliert zwei Berater (A, B) in derselben Org und prüft, dass
-- jede Grenze hält. Ein roter Test hier blockiert jeden Merge.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

-- ---------- Testdaten (als postgres, an RLS vorbei) ----------

insert into public.organizations (id, name)
values ('a0000000-0000-0000-0000-000000000001', 'TestOrg');

insert into public.organizations (id, name)
values ('a0000000-0000-0000-0000-000000000002', 'FremdeOrg');

insert into public.teams (id, org_id, name)
values ('b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000001', 'TestTeam');

insert into public.teams (id, org_id, name)
values ('b0000000-0000-0000-0000-000000000002',
        'a0000000-0000-0000-0000-000000000002', 'FremdesTeam');

-- Auth-User direkt anlegen. Der Trigger ist oben stillgelegt, weil
-- handle_new_user OHNE invite_code eine Ausnahme wirft. Der fruehere
-- Kommentar an dieser Stelle war sachlich falsch und hat genau dieses
-- Problem verdeckt.

-- ---------- Testumgebung: Trigger fuer den Auth-Insert umgehen ----------
-- on_auth_user_created ist ein AFTER-INSERT-Trigger auf auth.users und
-- ruft handle_new_user auf. Diese Funktion WIRFT eine Ausnahme, wenn
-- raw_user_meta_data keinen invite_code enthaelt. Ohne Umgehung laeuft
-- keine Testdatei durch.
--
-- WICHTIG, warum nicht ALTER TABLE ... DISABLE TRIGGER:
-- Das verlangt Eigentum an auth.users. Eigentuemer ist
-- supabase_auth_admin. Die Verbindungsrolle postgres ist dort NICHT
-- Mitglied und ist kein Superuser (geprueft: rolsuper = false). Auf
-- einer gehosteten Supabase-Datenbank scheitert der Befehl deshalb,
-- lokal wuerde er funktionieren. Das ergibt genau den Fall
-- "laeuft bei mir", der spaeter teuer wird.
--
-- session_replication_role wirkt fuer postgres, ist transaktionslokal
-- und funktioniert in beiden Umgebungen identisch.
-- Es wird unmittelbar nach dem Auth-Insert zurueckgeschaltet, damit
-- Fremdschluesselpruefungen und die Trigger contacts_log_created und
-- set_updated_at fuer alle weiteren Anweisungen wieder greifen.
set local session_replication_role = replica;
insert into auth.users (id, email)
values
  ('c0000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'b@test.local'),
  ('c0000000-0000-0000-0000-00000000000f', 'fremd@test.local');

-- Ab hier wieder vollstaendige Trigger- und Fremdschluesselpruefung.
set local session_replication_role = origin;

insert into public.profiles (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('c0000000-0000-0000-0000-00000000000a',
   'a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001',
   null, 'berater', 'Anna', 'A', 'anna_a'),
  ('c0000000-0000-0000-0000-00000000000b',
   'a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'berater', 'Ben', 'B', 'ben_b'),
  ('c0000000-0000-0000-0000-00000000000f',
   'a0000000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-000000000002',
   null, 'berater', 'Frida', 'F', 'frida_f');

-- Mitgliedschaften + Genealogie fuer current_org_id / profiles_public.
set local session_replication_role = replica;
insert into public.memberships (identity_id, org_id, team_id, role, status)
select p.id, p.org_id, p.team_id, p.role, 'active'
from public.profiles p
where p.id::text like 'c0000000%'
  and not exists (
    select 1 from public.memberships m
    where m.identity_id = p.id and m.org_id = p.org_id and m.status = 'active'
  );
update public.memberships m
set sponsor_membership_id = sp.id
from public.profiles p
join public.memberships sp
  on sp.identity_id = p.sponsor_id and sp.org_id = p.org_id and sp.status = 'active'
where m.identity_id = p.id and m.org_id = p.org_id and m.status = 'active'
  and p.id::text like 'c0000000%' and p.sponsor_id is not null;
set local session_replication_role = origin;

-- Kontakt von Anna inkl. automatischem contact_created-Event (Trigger).
insert into public.contacts (id, owner_id, org_id, name)
values ('d0000000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-00000000000a',
        'a0000000-0000-0000-0000-000000000001', 'Mehmet Test');


-- ---------- Hilfsfunktion: als Nutzer agieren ----------

create schema if not exists tests;

-- URSACHE A, behoben. Das Schema wird hier als postgres angelegt.
-- tests.authenticate_as schaltet die Rolle danach auf authenticated.
-- Der ERSTE Aufruf laeuft noch als postgres, jeder WEITERE als
-- authenticated, und die hat ohne diese Zeile kein USAGE auf einem
-- Schema, das postgres gerade erzeugt und nie freigegeben hat.
-- Ohne den Grant scheitert jeder zweite Rollenwechsel mit
--   permission denied for schema tests
grant usage on schema tests to authenticated;

create or replace function tests.authenticate_as(user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ============================================================
-- Tests als Anna (Owner)
-- ============================================================
select tests.authenticate_as('c0000000-0000-0000-0000-00000000000a');

select is(
  (select count(*)::int from public.contacts),
  1,
  'Anna sieht ihren eigenen Kontakt'
);

select is(
  (select count(*)::int from public.pipeline_events),
  1,
  'Anna sieht das automatische contact_created-Event ihres Kontakts'
);

select is(
  (select phase from public.contact_phases
   where contact_id = 'd0000000-0000-0000-0000-000000000001'),
  'lead',
  'Phase wird korrekt aus Events abgeleitet (lead bei nur contact_created)'
);

select is(
  (select count(*)::int from public.profiles),
  1,
  'Anna sieht auf der Tabelle NUR ihr eigenes Profil (Datenminimierung)'
);

select is(
  (select count(*)::int from public.profiles_public),
  2,
  'profiles_public zeigt Basisdaten der eigenen Org (2 von 3)'
);

select is(
  (select count(*)::int from public.organizations),
  1,
  'Anna sieht nur die eigene Organisation'
);

select throws_like(
  $$ update public.profiles
     set role = 'super_admin'
     where id = 'c0000000-0000-0000-0000-00000000000a' $$,
  '%können nicht selbst geändert werden%',
  'Anna kann ihre eigene Rolle nicht eskalieren'
);

-- ============================================================
-- Tests als Ben (gleiche Org, NICHT Owner)
-- ============================================================
select tests.authenticate_as('c0000000-0000-0000-0000-00000000000b');

select is(
  (select count(*)::int from public.contacts),
  0,
  'Ben sieht Annas Kontakte NICHT (Owner-only, auch im selben Team)'
);

select is(
  (select count(*)::int from public.pipeline_events),
  0,
  'Ben sieht Annas Pipeline-Events NICHT'
);

select throws_ok(
  $$ insert into public.pipeline_events (contact_id, org_id, event_type, created_by)
     values ('d0000000-0000-0000-0000-000000000001',
             'a0000000-0000-0000-0000-000000000001',
             'follow_up',
             'c0000000-0000-0000-0000-00000000000b') $$,
  '42501',
  null,
  'Ben kann keine Events auf fremde Kontakte schreiben'
);

select throws_ok(
  $$ insert into public.contacts (owner_id, org_id, name)
     values ('c0000000-0000-0000-0000-00000000000a',
             'a0000000-0000-0000-0000-000000000001', 'Eingeschleust') $$,
  '42501',
  null,
  'Ben kann keine Kontakte im Namen von Anna anlegen'
);

-- ============================================================
-- Tests als Frida (fremde Org)
-- ============================================================
select tests.authenticate_as('c0000000-0000-0000-0000-00000000000f');

select is(
  (select count(*)::int from public.profiles
   where org_id = 'a0000000-0000-0000-0000-000000000001'),
  0,
  'Org-Grenze dicht: Frida sieht keine Profile der TestOrg'
);

select is(
  (select count(*)::int from public.contacts),
  0,
  'Org-Grenze dicht: Frida sieht keinerlei fremde Kontakte'
);

select * from finish();

rollback;
