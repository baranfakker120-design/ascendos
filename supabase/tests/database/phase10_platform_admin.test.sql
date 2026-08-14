-- ============================================================
-- Phase 10: Platform Admin security (pgTAP)
-- Migration: 20260906000050_phase10_platform_admin.sql
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('aa100000-0000-0000-0000-00000000000a', 'p10-plat@test.local'),
  ('aa100000-0000-0000-0000-00000000000b', 'p10-plat2@test.local'),
  ('aa100000-0000-0000-0000-00000000000c', 'p10-admin-a@test.local'),
  ('aa100000-0000-0000-0000-00000000000d', 'p10-member@test.local'),
  ('aa100000-0000-0000-0000-00000000000e', 'p10-multi@test.local');
set local session_replication_role = origin;

insert into public.organizations (id, name, branding, status) values
  ('bb100000-0000-0000-0000-000000000001', 'P10 OrgA',
   '{"display_name":"Org A"}'::jsonb, 'active'),
  ('bb100000-0000-0000-0000-000000000002', 'P10 OrgB',
   '{"display_name":"Org B"}'::jsonb, 'active');

insert into public.teams (id, org_id, name) values
  ('cc100000-0000-0000-0000-000000000001', 'bb100000-0000-0000-0000-000000000001', 'P10 TeamA'),
  ('cc100000-0000-0000-0000-000000000002', 'bb100000-0000-0000-0000-000000000002', 'P10 TeamB');

insert into public.profiles
  (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('aa100000-0000-0000-0000-00000000000a', 'bb100000-0000-0000-0000-000000000001',
   'cc100000-0000-0000-0000-000000000001', null, 'berater', 'Plat', 'One', 'p10plat'),
  ('aa100000-0000-0000-0000-00000000000b', 'bb100000-0000-0000-0000-000000000001',
   'cc100000-0000-0000-0000-000000000001', null, 'berater', 'Plat', 'Two', 'p10plat2'),
  ('aa100000-0000-0000-0000-00000000000c', 'bb100000-0000-0000-0000-000000000001',
   'cc100000-0000-0000-0000-000000000001', null, 'admin', 'Org', 'Admin', 'p10admin'),
  ('aa100000-0000-0000-0000-00000000000d', 'bb100000-0000-0000-0000-000000000001',
   'cc100000-0000-0000-0000-000000000001', 'aa100000-0000-0000-0000-00000000000c',
   'berater', 'Mem', 'Ber', 'p10mem'),
  ('aa100000-0000-0000-0000-00000000000e', 'bb100000-0000-0000-0000-000000000001',
   'cc100000-0000-0000-0000-000000000001', null, 'admin', 'Multi', 'User', 'p10multi');

set local session_replication_role = replica;
insert into public.memberships (id, identity_id, org_id, team_id, role, status)
values
  ('dd100000-0000-0000-0000-00000000000a', 'aa100000-0000-0000-0000-00000000000a',
   'bb100000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001', 'berater', 'active'),
  ('dd100000-0000-0000-0000-00000000000b', 'aa100000-0000-0000-0000-00000000000b',
   'bb100000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001', 'berater', 'active'),
  ('dd100000-0000-0000-0000-00000000000c', 'aa100000-0000-0000-0000-00000000000c',
   'bb100000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('dd100000-0000-0000-0000-00000000000d', 'aa100000-0000-0000-0000-00000000000d',
   'bb100000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001', 'berater', 'active'),
  ('dd100000-0000-0000-0000-00000000000e', 'aa100000-0000-0000-0000-00000000000e',
   'bb100000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('dd100000-0000-0000-0000-00000000000f', 'aa100000-0000-0000-0000-00000000000e',
   'bb100000-0000-0000-0000-000000000002', 'cc100000-0000-0000-0000-000000000002', 'berater', 'active');
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

-- Bootstrap platform admins (elevated)
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '', true);

insert into public.platform_admins (identity_id, notes)
values
  ('aa100000-0000-0000-0000-00000000000a', 'p10 primary'),
  ('aa100000-0000-0000-0000-00000000000b', 'p10 secondary');

-- TEST A: Platform Admin lists organizations
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000a');
select tests.select_org('bb100000-0000-0000-0000-000000000001');
select ok(public.is_platform_super_admin(), 'TEST A prep: platform admin flag');
select ok(
  (select count(*)::int from public.platform_list_organizations()) >= 2,
  'TEST A: Platform Admin → list organizations PASS'
);

-- TEST B: Org Admin denied list
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000c');
select tests.select_org('bb100000-0000-0000-0000-000000000001');
select throws_ok(
  $$select * from public.platform_list_organizations()$$,
  '42501',
  null,
  'TEST B: Org Admin → list organizations DENY'
);

-- TEST C: Member denied list
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000d');
select tests.select_org('bb100000-0000-0000-0000-000000000001');
select throws_ok(
  $$select * from public.platform_list_organizations()$$,
  '42501',
  null,
  'TEST C: Member → list organizations DENY'
);

-- TEST D: Platform Admin create organization
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000a');
select lives_ok(
  $$select public.platform_create_organization(
      'P10 Test Tenant GmbH',
      'P10 Test Tenant',
      'https://example.test',
      null,
      null,
      null
    )$$,
  'TEST D: Platform Admin → create organization PASS'
);
select ok(
  exists (
    select 1 from public.organizations
    where name = 'P10 Test Tenant GmbH' and status = 'active'
  ),
  'TEST D: org row exists active'
);
-- Assert Main Team outside RLS (platform admin has no membership in new org).
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '', true);
select ok(
  exists (
    select 1 from public.teams t
    join public.organizations o on o.id = t.org_id
    where o.name = 'P10 Test Tenant GmbH' and t.name = 'Main Team'
  ),
  'TEST D: Main Team created'
);
select ok(
  (
    select branding->>'display_name' from public.organizations
    where name = 'P10 Test Tenant GmbH'
  ) = 'P10 Test Tenant',
  'TEST D: neutral branding display_name'
);
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000a');

-- TEST E: Org Admin create DENY
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000c');
select throws_ok(
  $$select public.platform_create_organization('Hack Org', 'Hack')$$,
  '42501',
  null,
  'TEST E: Org Admin → create organization DENY'
);

-- TEST F: Member create DENY
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000d');
select throws_ok(
  $$select public.platform_create_organization('Hack Org 2', 'Hack2')$$,
  '42501',
  null,
  'TEST F: Member → create organization DENY'
);

-- TEST G: Platform Admin deactivate Org B
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000a');
select lives_ok(
  $$select public.platform_set_organization_status(
      'bb100000-0000-0000-0000-000000000002', 'inactive'
    )$$,
  'TEST G: Platform Admin → deactivate Org B PASS'
);
select is(
  (select status from public.organizations where id = 'bb100000-0000-0000-0000-000000000002'),
  'inactive',
  'TEST G: Org B status inactive'
);

-- TEST H: Org Admin A cannot deactivate Org B
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000c');
select tests.select_org('bb100000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.platform_set_organization_status(
      'bb100000-0000-0000-0000-000000000002', 'inactive'
    )$$,
  '42501',
  null,
  'TEST H: Org Admin A → deactivate Org B DENY'
);

-- TEST I: Platform Admin reactivate Org B
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000a');
select lives_ok(
  $$select public.platform_set_organization_status(
      'bb100000-0000-0000-0000-000000000002', 'active'
    )$$,
  'TEST I: Platform Admin → reactivate Org B PASS'
);

-- TEST J: Org Admin platform_admins DENY
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000c');
select is(
  (select count(*)::int from public.platform_admins),
  0,
  'TEST J: Org Admin SELECT platform_admins → empty'
);
select throws_ok(
  $$select * from public.platform_list_platform_admins()$$,
  '42501',
  null,
  'TEST J: Org Admin list platform admins DENY'
);

-- TEST K: Platform Admin platform_admins PASS
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000a');
select ok(
  (select count(*)::int from public.platform_list_platform_admins()) >= 2,
  'TEST K: Platform Admin → platform_admins PASS'
);

-- TEST L: Last platform admin revoke DENY (revoke one first, then last)
select lives_ok(
  $$select public.platform_revoke_platform_admin('aa100000-0000-0000-0000-00000000000b')$$,
  'TEST L prep: revoke secondary admin PASS'
);
select throws_ok(
  $$select public.platform_revoke_platform_admin('aa100000-0000-0000-0000-00000000000a')$$,
  'P0001',
  null,
  'TEST L: Last platform admin revoke DENY'
);
-- Restore secondary for remaining tests
reset role;
select set_config('request.jwt.claims', '', true);
update public.platform_admins
set is_active = true, revoked_at = null
where identity_id = 'aa100000-0000-0000-0000-00000000000b';
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000a');

-- TEST M: Forged organization_id for status on random uuid
select throws_ok(
  $$select public.platform_set_organization_status(
      'ffffffff-ffff-ffff-ffff-ffffffffffff', 'inactive'
    )$$,
  'P0001',
  null,
  'TEST M: forged organization_id → DENY/not found'
);

-- TEST N: Forged x-ascendos-org — inactive org excluded from active membership
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000e');
select tests.select_org('bb100000-0000-0000-0000-000000000002');
-- deactivate B while platform
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000a');
select public.platform_set_organization_status(
  'bb100000-0000-0000-0000-000000000002', 'inactive'
);
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000e');
select tests.select_org('bb100000-0000-0000-0000-000000000002');
select ok(
  public.active_membership_id() is null,
  'TEST N: forged/active header to inactive org → no active membership'
);
-- reactivate B
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000a');
select public.platform_set_organization_status(
  'bb100000-0000-0000-0000-000000000002', 'active'
);

-- TEST O: Multi-org user is not platform admin
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000e');
select ok(not public.is_platform_super_admin(), 'TEST O: multi-org user not platform admin');
select throws_ok(
  $$select * from public.platform_list_organizations()$$,
  '42501',
  null,
  'TEST O: multi-org → platform list DENY'
);

-- Extra: org admin invite bound to target org
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000a');
select lives_ok(
  $$select * from public.platform_create_org_admin_invite(
      'bb100000-0000-0000-0000-000000000001', 'admin'
    )$$,
  'Org admin invite created for Org A'
);
reset role;
select set_config('request.jwt.claims', '', true);
select ok(
  exists (
    select 1 from public.invites
    where org_id = 'bb100000-0000-0000-0000-000000000001'
      and role = 'admin'
      and created_by = 'aa100000-0000-0000-0000-00000000000a'
  ),
  'Invite bound to Org A only'
);

-- Extra: org admin cannot change status via direct update
select tests.authenticate_as('aa100000-0000-0000-0000-00000000000c');
select tests.select_org('bb100000-0000-0000-0000-000000000001');
select throws_ok(
  $sql$update public.organizations
    set status = 'inactive'
    where id = 'bb100000-0000-0000-0000-000000000001'$sql$,
  'P0001',
  null,
  'Org admin direct status update DENY'
);

-- Unauthenticated / clear jwt cannot list
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('role', 'anon', true);
select throws_ok(
  $$select * from public.platform_list_organizations()$$,
  '42501',
  null,
  'Unauthenticated → list DENY'
);

select * from finish();
rollback;
