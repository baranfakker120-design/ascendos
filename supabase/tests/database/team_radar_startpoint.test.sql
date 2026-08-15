-- ============================================================
-- Team Seyda Radar startpoint — RLS / immutability (pgTAP)
-- Migration: 20260913000057_team_radar_startpoint.sql
-- TEST/CI ONLY — begin/rollback; does not mutate production.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

-- ---------- Fixtures ----------
set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('aa570000-0000-0000-0000-0000000000a1', 'radar-a@test.local'),
  ('aa570000-0000-0000-0000-0000000000b1', 'radar-b@test.local'),
  ('aa570000-0000-0000-0000-0000000000c1', 'radar-org2@test.local');
set local session_replication_role = origin;

-- Org #2 stand-in (neutral). Org #1 already seeded.
insert into public.organizations (id, name, status) values
  ('bb570000-0000-0000-0000-000000000002', 'Radar Isolation Org 2', 'active')
on conflict (id) do nothing;

insert into public.teams (id, org_id, name) values
  ('cc570000-0000-0000-0000-000000000002', 'bb570000-0000-0000-0000-000000000002', 'Radar Team 2')
on conflict (id) do nothing;

insert into public.profiles
  (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('aa570000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000011', null, 'berater', 'Radar', 'A', 'radara'),
  ('aa570000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000011', null, 'berater', 'Radar', 'B', 'radarb'),
  ('aa570000-0000-0000-0000-0000000000c1', 'bb570000-0000-0000-0000-000000000002',
   'cc570000-0000-0000-0000-000000000002', null, 'berater', 'Radar', 'C', 'radarc');

set local session_replication_role = replica;
insert into public.memberships (id, identity_id, org_id, team_id, role, status)
values
  ('dd570000-0000-0000-0000-0000000000a1', 'aa570000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011',
   'berater', 'active'),
  ('dd570000-0000-0000-0000-0000000000b1', 'aa570000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011',
   'berater', 'active'),
  ('dd570000-0000-0000-0000-0000000000c1', 'aa570000-0000-0000-0000-0000000000c1',
   'bb570000-0000-0000-0000-000000000002', 'cc570000-0000-0000-0000-000000000002',
   'berater', 'active');
set local session_replication_role = origin;

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

create or replace function tests.select_org(org uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.headers',
    json_build_object('x-ascendos-org', org::text)::text, true);
end;
$$;

-- Schema presence
select has_table('public', 'team_radar_user_state', 'team_radar_user_state exists');
select has_table('public', 'team_radar_items', 'team_radar_items exists');
select has_column('public', 'team_radar_user_state', 'radar_started_at', 'radar_started_at column');
select ok(
  (
    select relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'team_radar_user_state'
  ),
  'team_radar_user_state RLS enabled'
);

-- Existing product surfaces untouched
select has_table('public', 'content_instagram_connections', 'IG connections preserved');
select has_table('public', 'memberships', 'memberships preserved');
select has_table('public', 'organizations', 'organizations preserved');

-- 1) User A activates radar → radar_started_at set
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '', true);

select tests.authenticate_as('aa570000-0000-0000-0000-0000000000a1');
select tests.select_org('00000000-0000-0000-0000-000000000001');

select lives_ok(
  $$
    insert into public.team_radar_user_state (org_id, user_id, radar_started_at)
    values (
      '00000000-0000-0000-0000-000000000001',
      'aa570000-0000-0000-0000-0000000000a1',
      '2026-08-15T14:32:18.000Z'::timestamptz
    )
  $$,
  'user A can activate radar (insert startpoint)'
);

select results_eq(
  $$
    select radar_started_at = '2026-08-15T14:32:18.000Z'::timestamptz
    from public.team_radar_user_state
    where user_id = 'aa570000-0000-0000-0000-0000000000a1'
  $$,
  $$ values (true) $$,
  'user A radar_started_at stored'
);

-- 2) Existing-style user B activates independently
select tests.authenticate_as('aa570000-0000-0000-0000-0000000000b1');
select tests.select_org('00000000-0000-0000-0000-000000000001');

select lives_ok(
  $$
    insert into public.team_radar_user_state (org_id, user_id, radar_started_at)
    values (
      '00000000-0000-0000-0000-000000000001',
      'aa570000-0000-0000-0000-0000000000b1',
      '2026-08-15T16:00:00.000Z'::timestamptz
    )
  $$,
  'user B can activate radar with own startpoint'
);

-- 3) Poll must not move radar_started_at
select tests.authenticate_as('aa570000-0000-0000-0000-0000000000a1');
select tests.select_org('00000000-0000-0000-0000-000000000001');

select throws_ok(
  $$
    update public.team_radar_user_state
    set radar_started_at = now()
    where user_id = 'aa570000-0000-0000-0000-0000000000a1'
  $$,
  '23514',
  'radar_started_at is immutable after activation',
  'poll rewrite of radar_started_at is denied'
);

-- pause update (non-startpoint fields) still allowed
select lives_ok(
  $$
    update public.team_radar_user_state
    set paused = true
    where user_id = 'aa570000-0000-0000-0000-0000000000a1'
  $$,
  'pause keeps startpoint (paused update allowed)'
);

select results_eq(
  $$
    select radar_started_at = '2026-08-15T14:32:18.000Z'::timestamptz
         and paused = true
    from public.team_radar_user_state
    where user_id = 'aa570000-0000-0000-0000-0000000000a1'
  $$,
  $$ values (true) $$,
  'pause does not change radar_started_at'
);

-- 4/5) Item ledger: only post-start published_at rows (app filter); DB accepts insert
select lives_ok(
  $$
    insert into public.team_radar_items
      (org_id, user_id, source, external_id, content_type, published_at)
    values (
      '00000000-0000-0000-0000-000000000001',
      'aa570000-0000-0000-0000-0000000000a1',
      'chogan', 'new-post-1', 'POST',
      '2026-08-15T14:33:00.000Z'::timestamptz
    )
  $$,
  'new post after start can be recorded'
);

-- 6) User A cannot read/manipulate User B startpoint
select is_empty(
  $$
    select 1 from public.team_radar_user_state
    where user_id = 'aa570000-0000-0000-0000-0000000000b1'
  $$,
  'user A cannot read user B startpoint'
);

-- Cross-user UPDATE matches 0 rows under RLS (no error); verify no mutation.
select lives_ok(
  $$
    update public.team_radar_user_state
    set paused = true
    where user_id = 'aa570000-0000-0000-0000-0000000000b1'
  $$,
  'user A UPDATE of user B startpoint is a no-op under RLS'
);

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '', true);

select results_eq(
  $$
    select paused
    from public.team_radar_user_state
    where user_id = 'aa570000-0000-0000-0000-0000000000b1'
  $$,
  $$ values (false) $$,
  'user B startpoint unchanged after cross-user update attempt'
);

-- 7) Org #2 member cannot read Org #1 startpoint
select tests.authenticate_as('aa570000-0000-0000-0000-0000000000c1');
select tests.select_org('bb570000-0000-0000-0000-000000000002');

select is_empty(
  $$ select 1 from public.team_radar_user_state $$,
  'org #2 cannot read org #1 radar startpoints'
);

-- Org #2 cannot insert into radar (product gate + check)
select throws_ok(
  $$
    insert into public.team_radar_user_state (org_id, user_id, radar_started_at)
    values (
      'bb570000-0000-0000-0000-000000000002',
      'aa570000-0000-0000-0000-0000000000c1',
      now()
    )
  $$,
  null,
  null,
  'org #2 cannot create radar startpoint'
);

-- 8) Forged organization_id / forged org header → DENY
select tests.authenticate_as('aa570000-0000-0000-0000-0000000000a1');
select tests.select_org('00000000-0000-0000-0000-000000000001');

select throws_ok(
  $$
    insert into public.team_radar_user_state (org_id, user_id, radar_started_at)
    values (
      'bb570000-0000-0000-0000-000000000002',
      'aa570000-0000-0000-0000-0000000000a1',
      now()
    )
  $$,
  null,
  null,
  'forged organization_id denied'
);

select tests.select_org('bb570000-0000-0000-0000-000000000002');
select is_empty(
  $$ select 1 from public.team_radar_user_state $$,
  'forged org header (no membership) denies radar rows'
);

select * from finish();
rollback;
