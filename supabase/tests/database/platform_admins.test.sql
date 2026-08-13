-- ============================================================
-- Phase 2: platform_admins + org/platform helper separation (pgTAP)
-- Migration: 20260830000043_platform_admins_and_org_role_helpers.sql
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

-- ---------- Auth inserts (bypass handle_new_user invite requirement) ----------
set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('d6000000-0000-0000-0000-00000000000a', 'p2-anna@test.local'),
  ('d6000000-0000-0000-0000-00000000000b', 'p2-bert@test.local'),
  ('d6000000-0000-0000-0000-00000000000c', 'p2-cara@test.local'),
  ('d6000000-0000-0000-0000-00000000000p', 'p2-plat@test.local');
set local session_replication_role = origin;

insert into public.organizations (id, name) values
  ('e6000000-0000-0000-0000-000000000001', 'P2 OrgA'),
  ('e6000000-0000-0000-0000-000000000002', 'P2 OrgB');

-- Seed Org1 (Chogan) must remain present for Team Seyda / Org1 continuity.
select ok(
  exists (
    select 1 from public.organizations
    where id = '00000000-0000-0000-0000-000000000001'
  ),
  'Team Seyda / Org1 (Chogan seed) remains present'
);

insert into public.teams (id, org_id, name) values
  ('f6000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000001', 'P2 TeamA'),
  ('f6000000-0000-0000-0000-000000000002', 'e6000000-0000-0000-0000-000000000002', 'P2 TeamB');

insert into public.profiles
  (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('d6000000-0000-0000-0000-00000000000a', 'e6000000-0000-0000-0000-000000000001',
   'f6000000-0000-0000-0000-000000000001', null, 'super_admin', 'P2Anna', 'A', 'p2anna'),
  ('d6000000-0000-0000-0000-00000000000b', 'e6000000-0000-0000-0000-000000000001',
   'f6000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-00000000000a', 'berater', 'P2Bert', 'B', 'p2bert'),
  ('d6000000-0000-0000-0000-00000000000c', 'e6000000-0000-0000-0000-000000000002',
   'f6000000-0000-0000-0000-000000000002', null, 'admin', 'P2Cara', 'C', 'p2cara'),
  ('d6000000-0000-0000-0000-00000000000p', 'e6000000-0000-0000-0000-000000000001',
   'f6000000-0000-0000-0000-000000000001', null, 'berater', 'P2Plat', 'P', 'p2plat');

set local session_replication_role = replica;
insert into public.memberships (identity_id, org_id, team_id, role, status)
values
  ('d6000000-0000-0000-0000-00000000000a', 'e6000000-0000-0000-0000-000000000001',
   'f6000000-0000-0000-0000-000000000001', 'super_admin', 'active'),
  ('d6000000-0000-0000-0000-00000000000b', 'e6000000-0000-0000-0000-000000000001',
   'f6000000-0000-0000-0000-000000000001', 'berater', 'active'),
  ('d6000000-0000-0000-0000-00000000000c', 'e6000000-0000-0000-0000-000000000002',
   'f6000000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('d6000000-0000-0000-0000-00000000000p', 'e6000000-0000-0000-0000-000000000001',
   'f6000000-0000-0000-0000-000000000001', 'berater', 'active'),
  ('d6000000-0000-0000-0000-00000000000a', 'e6000000-0000-0000-0000-000000000002',
   'f6000000-0000-0000-0000-000000000002', 'berater', 'active');
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

create or replace function tests.clear_org_header()
returns void language plpgsql as $$
begin
  perform set_config('request.headers', '{}', true);
end;
$$;

-- Elevated setup for platform_admins insert (no auto-promote from org roles)
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '', true);

insert into public.platform_admins (identity_id, notes)
values ('d6000000-0000-0000-0000-00000000000p', 'p2 test bootstrap');

-- 1) Member (berater) is NOT platform admin
select tests.authenticate_as('d6000000-0000-0000-0000-00000000000b');
select tests.select_org('e6000000-0000-0000-0000-000000000001');
select is(public.is_platform_super_admin(), false, 'berater is not platform admin');
select is(public.is_organization_admin(), false, 'berater is not organization admin');
select is(public.is_super_admin(), false, 'berater is not org super_admin');

-- 2+3) Org super_admin is NOT automatically platform admin
select tests.authenticate_as('d6000000-0000-0000-0000-00000000000a');
select tests.select_org('e6000000-0000-0000-0000-000000000001');
select is(public.is_super_admin(), true, 'org super_admin still is_super_admin()');
select is(public.is_organization_admin(), true, 'org super_admin is_organization_admin()');
select is(public.is_platform_super_admin(), false, 'org super_admin is NOT platform admin');

-- admin role → organization admin, not platform
select tests.authenticate_as('d6000000-0000-0000-0000-00000000000c');
select tests.select_org('e6000000-0000-0000-0000-000000000002');
select is(public.is_organization_admin(), true, 'membership admin is_organization_admin()');
select is(public.is_super_admin(), false, 'membership admin is not is_super_admin()');
select is(public.is_platform_super_admin(), false, 'membership admin is not platform admin');

-- 4) Explicit platform_admins row is recognized
select tests.authenticate_as('d6000000-0000-0000-0000-00000000000p');
select tests.select_org('e6000000-0000-0000-0000-000000000001');
select is(public.is_platform_super_admin(), true, 'explicit platform_admins row is detected');
select is(public.is_super_admin(), false, 'platform admin berater membership is not org super_admin');

-- 5) Deactivated platform admin rejected
reset role;
update public.platform_admins
set is_active = false, revoked_at = now()
where identity_id = 'd6000000-0000-0000-0000-00000000000p';

select tests.authenticate_as('d6000000-0000-0000-0000-00000000000p');
select tests.select_org('e6000000-0000-0000-0000-000000000001');
select is(public.is_platform_super_admin(), false, 'deactivated platform admin is rejected');

-- 6+7) Org admin scoped to own org; forged foreign org denied
select tests.authenticate_as('d6000000-0000-0000-0000-00000000000c');
select tests.select_org('e6000000-0000-0000-0000-000000000002');
select is(
  public.current_org_id(),
  'e6000000-0000-0000-0000-000000000002'::uuid,
  'org admin resolves own organization'
);

select tests.select_org('e6000000-0000-0000-0000-000000000001');
select is(public.active_membership_id(), null::uuid,
  'org admin cannot activate forged foreign org header');
select is(public.current_org_id(), null::uuid,
  'forged org header yields null current_org_id');
select is(public.is_organization_admin(), false,
  'without valid active membership, is_organization_admin is false');

-- 8) Forged header for user without that membership
select tests.authenticate_as('d6000000-0000-0000-0000-00000000000b');
select tests.select_org('e6000000-0000-0000-0000-000000000002');
select is(public.active_membership_id(), null::uuid, 'forged x-ascendos-org denied');

-- 9) Single-membership user works without header
select tests.authenticate_as('d6000000-0000-0000-0000-00000000000b');
select tests.clear_org_header();
select isnt(public.active_membership_id(), null::uuid,
  'single active membership auto-resolves without header');
select is(
  public.current_org_id(),
  'e6000000-0000-0000-0000-000000000001'::uuid,
  'single membership resolves OrgA'
);

-- 10) Multi-membership without header → deny
select tests.authenticate_as('d6000000-0000-0000-0000-00000000000a');
select tests.clear_org_header();
select is(public.active_membership_id(), null::uuid,
  'multi membership without header is rejected');

-- 11) Multi-org user may use header only for orgs they belong to
select tests.authenticate_as('d6000000-0000-0000-0000-00000000000a');
select tests.select_org('e6000000-0000-0000-0000-000000000002');
select is(
  public.current_org_id(),
  'e6000000-0000-0000-0000-000000000002'::uuid,
  'multi-org user may select OrgB when membership exists'
);
select is(public.is_super_admin(), false,
  'in OrgB Anna is berater — not org super_admin for that membership');

-- Helper presence (role compatibility surface)
select ok(
  to_regprocedure('public.is_platform_super_admin()') is not null,
  'is_platform_super_admin() exists'
);
select ok(
  to_regprocedure('public.is_organization_admin()') is not null,
  'is_organization_admin() exists'
);

select * from finish();
rollback;
