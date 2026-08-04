-- Sprint 6 System 2: monthly awards calculator behavior
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_function('public', 'compute_monthly_awards', array['uuid', 'date']);
select has_function('public', 'run_monthly_awards_job', array['date']);
select has_function('public', 'ensure_monthly_awards', array[]::text[]);
select has_function('public', 'list_monthly_awards', array['integer']);

select has_function_privilege(
  'service_role', 'public.compute_monthly_awards(uuid, date)', 'EXECUTE'
);
select has_function_privilege(
  'authenticated', 'public.ensure_monthly_awards()', 'EXECUTE'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.compute_monthly_awards(uuid, date)', 'EXECUTE'
  ),
  'authenticated cannot execute compute_monthly_awards'
);

-- ---------- Seed ----------
set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('e2000000-0000-0000-0000-00000000000a', 'ma-a@test.local'),
  ('e2000000-0000-0000-0000-00000000000b', 'ma-b@test.local'),
  ('e2000000-0000-0000-0000-00000000000c', 'ma-c@test.local'),
  ('e2000000-0000-0000-0000-00000000000d', 'ma-d@test.local');
set local session_replication_role = origin;

insert into public.organizations (id, name) values
  ('e1000000-0000-0000-0000-000000000001', 'MA Org');

insert into public.teams (id, org_id, name) values
  ('e1100000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'MA Team');

insert into public.profiles (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('e2000000-0000-0000-0000-00000000000a','e1000000-0000-0000-0000-000000000001',
   'e1100000-0000-0000-0000-000000000001', null,'super_admin','MA','A','maa'),
  ('e2000000-0000-0000-0000-00000000000b','e1000000-0000-0000-0000-000000000001',
   'e1100000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-00000000000a','berater','MA','B','mab'),
  ('e2000000-0000-0000-0000-00000000000c','e1000000-0000-0000-0000-000000000001',
   'e1100000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-00000000000a','berater','MA','C','mac'),
  ('e2000000-0000-0000-0000-00000000000d','e1000000-0000-0000-0000-000000000001',
   'e1100000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-00000000000a','berater','MA','D','mad');

set local session_replication_role = replica;
insert into public.memberships (id, identity_id, org_id, team_id, role, status, created_at)
values
  ('e3000000-0000-0000-0000-00000000000a','e2000000-0000-0000-0000-00000000000a',
   'e1000000-0000-0000-0000-000000000001','e1100000-0000-0000-0000-000000000001','super_admin','active','2025-01-01T00:00:00Z'),
  ('e3000000-0000-0000-0000-00000000000b','e2000000-0000-0000-0000-00000000000b',
   'e1000000-0000-0000-0000-000000000001','e1100000-0000-0000-0000-000000000001','berater','active','2025-01-02T00:00:00Z'),
  ('e3000000-0000-0000-0000-00000000000c','e2000000-0000-0000-0000-00000000000c',
   'e1000000-0000-0000-0000-000000000001','e1100000-0000-0000-0000-000000000001','berater','active','2025-01-03T00:00:00Z'),
  ('e3000000-0000-0000-0000-00000000000d','e2000000-0000-0000-0000-00000000000d',
   'e1000000-0000-0000-0000-000000000001','e1100000-0000-0000-0000-000000000001','berater','active','2025-01-01T12:00:00Z');
set local session_replication_role = origin;

insert into public.cosmetic_items (org_id, kind, key, label, asset_path, rank_key, sort_order)
select 'e1000000-0000-0000-0000-000000000001', 'frame', 'hero-berater-des-monats',
       'Berater des Monats', 'frame-10', null, 100
on conflict (org_id, kind, key) do nothing;

-- Activity month = 2026-03 (for title 2026-04)
-- B: 300 AP, C: 200, D: 200 (tie with C — D older → place 2), A: 50
insert into public.ap_ledger (membership_id, delta, reason, source_kind, created_at)
values
  ('e3000000-0000-0000-0000-00000000000b', 300, 'test', 'manual', '2026-03-10T12:00:00Z'),
  ('e3000000-0000-0000-0000-00000000000c', 200, 'test', 'manual', '2026-03-11T12:00:00Z'),
  ('e3000000-0000-0000-0000-00000000000d', 200, 'test', 'manual', '2026-03-12T12:00:00Z'),
  ('e3000000-0000-0000-0000-00000000000a',  50, 'test', 'manual', '2026-03-15T12:00:00Z'),
  -- Outside activity window — must not count
  ('e3000000-0000-0000-0000-00000000000b', 999, 'test', 'manual', '2026-04-02T12:00:00Z'),
  ('e3000000-0000-0000-0000-00000000000c', 999, 'test', 'manual', '2026-02-28T12:00:00Z');

select is(
  (public.compute_monthly_awards(
    'e1000000-0000-0000-0000-000000000001'::uuid,
    '2026-04-01'::date
  )->>'status'),
  'computed',
  'first compute writes awards'
);

select results_eq(
  $$
    select place, membership_id::text, ap_in_period
    from public.monthly_awards
    where org_id = 'e1000000-0000-0000-0000-000000000001'
      and period = '2026-04-01'
    order by place
  $$,
  $$
    values
      (1, 'e3000000-0000-0000-0000-00000000000b', 300),
      (2, 'e3000000-0000-0000-0000-00000000000d', 200),
      (3, 'e3000000-0000-0000-0000-00000000000c', 200)
  $$,
  'podium: AP desc, then older membership on ties'
);

select is(
  (public.compute_monthly_awards(
    'e1000000-0000-0000-0000-000000000001'::uuid,
    '2026-04-01'::date
  )->>'status'),
  'already_computed',
  'idempotent — second compute skips'
);

select ok(
  exists (
    select 1
    from public.membership_cosmetics mc
    join public.cosmetic_items ci on ci.id = mc.item_id
    where mc.membership_id = 'e3000000-0000-0000-0000-00000000000b'
      and ci.key = 'hero-berater-des-monats'
  ),
  'place 1 unlocks hero-berater cosmetic'
);

select is(
  (select count(*)::int from public.monthly_awards
   where org_id = 'e1000000-0000-0000-0000-000000000001' and period = '2026-04-01'),
  3,
  'exactly three award rows'
);

select * from finish();
rollback;
