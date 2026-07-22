-- ============================================================
-- Tests Sprint 5: Tages-Freischaltung, Sponsor sieht NUR
-- Fortschritt der Firstline, Achievement-Evaluator.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

create schema if not exists tests;

create or replace function tests.authenticate_as(user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ---------- Szenario ----------
insert into public.organizations (id, name)
values ('a3000000-0000-0000-0000-000000000001', 'JourneyOrg');

insert into public.teams (id, org_id, name)
values ('b3000000-0000-0000-0000-000000000001',
        'a3000000-0000-0000-0000-000000000001', 'JourneyTeam');

insert into auth.users (id, email) values
  ('c3000000-0000-0000-0000-000000000001', 'sponsor@test.local'),
  ('c3000000-0000-0000-0000-000000000002', 'neuling@test.local'),
  ('c3000000-0000-0000-0000-000000000003', 'fremder@test.local');

insert into public.profiles (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('c3000000-0000-0000-0000-000000000001',
   'a3000000-0000-0000-0000-000000000001',
   'b3000000-0000-0000-0000-000000000001',
   null, 'berater', 'Selin', 'S', 'selin_s'),
  ('c3000000-0000-0000-0000-000000000002',
   'a3000000-0000-0000-0000-000000000001',
   'b3000000-0000-0000-0000-000000000001',
   'c3000000-0000-0000-0000-000000000001', 'berater', 'Nuri', 'N', 'nuri_n'),
  ('c3000000-0000-0000-0000-000000000003',
   'a3000000-0000-0000-0000-000000000001',
   'b3000000-0000-0000-0000-000000000001',
   null, 'berater', 'Faruk', 'F', 'faruk_f');

insert into public.journeys (id, org_id, team_id, title)
values ('e3000000-0000-0000-0000-000000000001',
        'a3000000-0000-0000-0000-000000000001',
        'b3000000-0000-0000-0000-000000000001', 'Testreise');

insert into public.journey_steps (id, journey_id, day_number, step_order, title) values
  ('f3000000-0000-0000-0000-000000000001',
   'e3000000-0000-0000-0000-000000000001', 1, 1, 'Tag1 Schritt1'),
  ('f3000000-0000-0000-0000-000000000002',
   'e3000000-0000-0000-0000-000000000001', 1, 2, 'Tag1 Schritt2'),
  ('f3000000-0000-0000-0000-000000000003',
   'e3000000-0000-0000-0000-000000000001', 2, 1, 'Tag2 Schritt1');

insert into public.achievements (id, org_id, key, title, description, condition)
values ('a4000000-0000-0000-0000-000000000001',
        'a3000000-0000-0000-0000-000000000001',
        'startklar_test', 'Startklar', 'Reise fertig',
        '{"type": "journey_completed"}');

-- ---------- Als Nuri (Neuling) ----------
select tests.authenticate_as('c3000000-0000-0000-0000-000000000002');

select throws_like(
  $$ select public.complete_journey_step('f3000000-0000-0000-0000-000000000003') $$,
  '%noch nicht freigeschaltet%',
  'Tag 2 ist gesperrt, solange Tag 1 offen ist'
);

select lives_ok(
  $$ select public.complete_journey_step('f3000000-0000-0000-0000-000000000001') $$,
  'Tag-1-Schritt lässt sich abschließen'
);

select is(
  (select count(*)::int from public.check_achievements()),
  0,
  'Evaluator schaltet nichts frei, solange die Reise unvollständig ist'
);

select public.complete_journey_step('f3000000-0000-0000-0000-000000000002');
select lives_ok(
  $$ select public.complete_journey_step('f3000000-0000-0000-0000-000000000003') $$,
  'Nach Tag 1 ist Tag 2 freigeschaltet'
);

select is(
  (select count(*)::int from public.check_achievements()),
  1,
  'Vollständige Reise schaltet das journey_completed-Achievement frei'
);

select is(
  (select count(*)::int from public.check_achievements()),
  0,
  'Evaluator ist idempotent (keine Doppel-Freischaltung)'
);

-- ---------- Als Selin (Sponsor) ----------
select tests.authenticate_as('c3000000-0000-0000-0000-000000000001');

select is(
  (select completed_steps::int from public.firstline_journey_progress
   where user_id = 'c3000000-0000-0000-0000-000000000002'),
  3,
  'Sponsor sieht den Fortschritt seiner Firstline (3 von 3 Schritten)'
);

-- ---------- Als Faruk (KEIN Sponsor von Nuri) ----------
select tests.authenticate_as('c3000000-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.user_progress
   where user_id = 'c3000000-0000-0000-0000-000000000002'),
  0,
  'Nicht-Sponsoren sehen fremden Fortschritt NICHT (RLS-Grenze)'
);

select * from finish();

rollback;
