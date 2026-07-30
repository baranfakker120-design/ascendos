-- ============================================================
-- Sprint 2b: Registrierung und Einladungen (pgTAP)
-- Prueft Migration 20260803000016_registration_and_invites.sql
--
-- Schwerpunkt: die zwei Wege aus F2 Teil 1.7. Ohne den zweiten Weg
-- entstehen Doppelidentitaeten desselben Menschen, die sich
-- nachtraeglich nur unter Datenverlust zusammenfuehren lassen.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into public.organizations (id, name) values
  ('a6000000-0000-0000-0000-000000000001', 'S2b HeimOrg'),
  ('a6000000-0000-0000-0000-000000000002', 'S2b ZweitOrg');

insert into public.teams (id, org_id, name) values
  ('b6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'S2b Team'),
  ('b6000000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000002', 'S2b ZweitTeam');

-- Sponsor Anna, ueber den echten Trigger-Pfad NICHT anlegbar, weil sie
-- die erste ist. Daher wie in Migration 15: Trigger fuer den
-- Auth-Insert umgehen und Identitaet plus Mitgliedschaft von Hand.
set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('c6000000-0000-0000-0000-00000000000a', 's2b-anna@test.local');
set local session_replication_role = origin;

insert into public.profiles
  (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values ('c6000000-0000-0000-0000-00000000000a','a6000000-0000-0000-0000-000000000001',
        'b6000000-0000-0000-0000-000000000001', null,'super_admin','S2bAnna','A','s2banna');

insert into public.memberships (identity_id, org_id, team_id, role, status)
values ('c6000000-0000-0000-0000-00000000000a','a6000000-0000-0000-0000-000000000001',
        'b6000000-0000-0000-0000-000000000001','super_admin','active');

insert into public.invites (code, org_id, team_id, sponsor_id, role, created_by, expires_at)
values
  ('S2BNEU0001','a6000000-0000-0000-0000-000000000001','b6000000-0000-0000-0000-000000000001',
   'c6000000-0000-0000-0000-00000000000a','berater',
   'c6000000-0000-0000-0000-00000000000a', now() + interval '7 days'),
  ('S2BZWEIT01','a6000000-0000-0000-0000-000000000002','b6000000-0000-0000-0000-000000000002',
   null,'berater', 'c6000000-0000-0000-0000-00000000000a', now() + interval '7 days'),
  ('S2BADMIN01','a6000000-0000-0000-0000-000000000001','b6000000-0000-0000-0000-000000000001',
   'c6000000-0000-0000-0000-00000000000a','admin',
   'c6000000-0000-0000-0000-00000000000a', now() + interval '7 days');

create schema if not exists tests;
grant usage on schema tests to authenticated;

create or replace function tests.authenticate_as(user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.clear_org()
returns void language plpgsql as $$
begin
  perform set_config('request.headers', '{}', true);
end;
$$;

-- ============================================================
-- A. invites.role kennt jetzt 'admin'
-- ============================================================

select is(
  (select count(*)::int from public.invites where code = 'S2BADMIN01' and role = 'admin'),
  1,
  'A1 Eine Admin-Einladung ist anlegbar (invites_role_check erweitert)'
);

-- ============================================================
-- B. Weg 1: neue Identitaet UND Mitgliedschaft
--    Ueber den ECHTEN Trigger-Pfad, nicht simuliert.
-- ============================================================

select lives_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data)
     values ('c6000000-0000-0000-0000-00000000000b', 's2b-bert@test.local',
             '{"invite_code":"S2BNEU0001","username":"s2bbert",
               "first_name":"S2bBert","last_name":"B"}'::jsonb) $$,
  'B1 Registrierung mit gueltigem Code laeuft durch'
);

select is(
  (select count(*)::int from public.profiles
   where id = 'c6000000-0000-0000-0000-00000000000b'),
  1,
  'B2 Identitaet wurde angelegt'
);

select is(
  (select count(*)::int from public.memberships
   where identity_id = 'c6000000-0000-0000-0000-00000000000b' and status = 'active'),
  1,
  'B3 Mitgliedschaft wurde angelegt. OHNE diesen Schritt waere das Konto funktionslos'
);

select is(
  (select sp.identity_id::text
   from public.memberships m
   join public.memberships sp on sp.id = m.sponsor_membership_id
   where m.identity_id = 'c6000000-0000-0000-0000-00000000000b'),
  'c6000000-0000-0000-0000-00000000000a',
  'B4 Sponsor wurde von der Identitaets- auf die Mitgliedschaftskennung aufgeloest'
);

select isnt(
  (select used_at from public.invites where code = 'S2BNEU0001'),
  null,
  'B5 Die Einladung ist als verbraucht markiert'
);

-- ============================================================
-- C. Weg 2: bestehende Identitaet tritt einer ZWEITEN Organisation bei
-- ============================================================

select tests.authenticate_as('c6000000-0000-0000-0000-00000000000b'); -- Bert
select tests.clear_org();

select lives_ok(
  $$ select public.redeem_invite('S2BZWEIT01') $$,
  'C1 redeem_invite laeuft fuer eine bestehende Identitaet'
);

select is(
  (select count(*)::int from public.profiles
   where id = 'c6000000-0000-0000-0000-00000000000b'),
  1,
  'C2 Es entstand KEINE zweite Identitaet. Genau das verhindert Doppelidentitaeten'
);

select is(
  (select count(*)::int from public.memberships
   where identity_id = 'c6000000-0000-0000-0000-00000000000b' and status = 'active'),
  2,
  'C3 Bert hat jetzt ZWEI aktive Mitgliedschaften'
);

-- Und damit greift Fall 4 der Aufloesungsregel aus F2 Teil 1.3.
select is(
  public.current_org_id(),
  null,
  'C4 Zwei aktive Mitgliedschaften ohne Selektor -> ABWEISEN, nicht raten'
);

-- ============================================================
-- D. redeem_invite weist die falschen Faelle ab
-- ============================================================

reset role;
insert into public.invites (code, org_id, team_id, sponsor_id, role, created_by, expires_at)
values ('S2BDOPPEL1','a6000000-0000-0000-0000-000000000002','b6000000-0000-0000-0000-000000000002',
        null,'berater','c6000000-0000-0000-0000-00000000000a', now() + interval '7 days');

select tests.authenticate_as('c6000000-0000-0000-0000-00000000000b');

select throws_like(
  $$ select public.redeem_invite('S2BDOPPEL1') $$,
  '%gehörst dieser Organisation bereits an%',
  'D1 Zweite aktive Mitgliedschaft in derselben Organisation wird abgewiesen'
);

select throws_like(
  $$ select public.redeem_invite('S2BNEU0001') $$,
  '%bereits verwendet%',
  'D2 Eine verbrauchte Einladung wird abgewiesen'
);

-- ============================================================
-- E. create_invite speist sich aus der aktiven Mitgliedschaft
-- ============================================================

select tests.authenticate_as('c6000000-0000-0000-0000-00000000000a'); -- Anna, super_admin
select tests.clear_org();

select isnt(
  (select invite_code from public.create_invite('berater') limit 1),
  null,
  'E1 create_invite erzeugt einen Code aus der aktiven Mitgliedschaft'
);

select tests.authenticate_as('c6000000-0000-0000-0000-00000000000b'); -- Bert
-- Bert hat zwei aktive Mitgliedschaften, ohne Selektor ist die aktive
-- mehrdeutig. create_invite muss das abweisen, nicht raten.
select tests.clear_org();

select throws_like(
  $$ select public.create_invite('berater') $$,
  '%Keine aktive Mitgliedschaft%',
  'E2 Bei mehrdeutiger Mitgliedschaft weist create_invite ab'
);

-- ============================================================

reset role;
select * from finish();
rollback;
