-- Sprint 6 System 2: monthly awards calculator behavior
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_function('public', 'compute_monthly_awards', array['uuid', 'date']);
select has_function('public', 'run_monthly_awards_job', array['date']);
select has_function('public', 'ensure_monthly_awards');
select has_function('public', 'list_monthly_awards', array['integer']);

select ok(
  exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'compute_monthly_awards'
      and grantee = 'service_role'
      and privilege_type = 'EXECUTE'
  ),
  'service_role can execute compute_monthly_awards'
);

select ok(
  exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'ensure_monthly_awards'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  ),
  'authenticated can execute ensure_monthly_awards'
);

select ok(
  not exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'compute_monthly_awards'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
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

-- Memberships: prefer existing auto-rows, else insert. Fix created_at for ties.
set local session_replication_role = replica;
insert into public.memberships (identity_id, org_id, team_id, role, status, created_at)
select p.id, p.org_id, p.team_id, p.role, 'active', '2025-01-01T00:00:00Z'
from public.profiles p
where p.id::text like 'e2000000%'
  and not exists (
    select 1 from public.memberships m
    where m.identity_id = p.id and m.org_id = p.org_id and m.status = 'active'
  );

update public.memberships
set created_at = case identity_id
  when 'e2000000-0000-0000-0000-00000000000a' then '2025-01-01T00:00:00Z'::timestamptz
  when 'e2000000-0000-0000-0000-00000000000b' then '2025-01-02T00:00:00Z'::timestamptz
  when 'e2000000-0000-0000-0000-00000000000c' then '2025-01-03T00:00:00Z'::timestamptz
  when 'e2000000-0000-0000-0000-00000000000d' then '2025-01-01T12:00:00Z'::timestamptz
  else created_at
end
where org_id = 'e1000000-0000-0000-0000-000000000001'
  and identity_id::text like 'e2000000%';
set local session_replication_role = origin;

insert into public.cosmetic_items (org_id, kind, key, label, asset_path, rank_key, sort_order)
select 'e1000000-0000-0000-0000-000000000001', 'frame', 'hero-berater-des-monats',
       'Berater des Monats', 'frame-10', null, 100
on conflict (org_id, kind, key) do nothing;

-- Activity month = 2026-03 (for title 2026-04)
insert into public.ap_ledger (membership_id, delta, reason, source_kind, created_at)
select m.id, v.delta, 'test', 'manual', v.at
from public.memberships m
join (
  values
    ('e2000000-0000-0000-0000-00000000000b'::uuid, 300, '2026-03-10T12:00:00Z'::timestamptz),
    ('e2000000-0000-0000-0000-00000000000c'::uuid, 200, '2026-03-11T12:00:00Z'::timestamptz),
    ('e2000000-0000-0000-0000-00000000000d'::uuid, 200, '2026-03-12T12:00:00Z'::timestamptz),
    ('e2000000-0000-0000-0000-00000000000a'::uuid,  50, '2026-03-15T12:00:00Z'::timestamptz),
    ('e2000000-0000-0000-0000-00000000000b'::uuid, 999, '2026-04-02T12:00:00Z'::timestamptz),
    ('e2000000-0000-0000-0000-00000000000c'::uuid, 999, '2026-02-28T12:00:00Z'::timestamptz)
) as v(identity_id, delta, at) on m.identity_id = v.identity_id
where m.org_id = 'e1000000-0000-0000-0000-000000000001'
  and m.status = 'active';

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
    select ma.place, p.username, ma.ap_in_period
    from public.monthly_awards ma
    join public.memberships m on m.id = ma.membership_id
    join public.profiles p on p.id = m.identity_id
    where ma.org_id = 'e1000000-0000-0000-0000-000000000001'
      and ma.period = '2026-04-01'
    order by ma.place
  $$,
  $$
    values
      (1, 'mab', 300),
      (2, 'mad', 200),
      (3, 'mac', 200)
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
    join public.memberships m on m.id = mc.membership_id
    where m.identity_id = 'e2000000-0000-0000-0000-00000000000b'
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
