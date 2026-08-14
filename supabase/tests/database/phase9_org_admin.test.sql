-- ============================================================
-- Phase 9: Organization Admin security (pgTAP)
-- Migration: 20260905000049_phase9_org_admin_writes.sql
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('a9000000-0000-0000-0000-00000000000a', 'p9-admin-a@test.local'),
  ('a9000000-0000-0000-0000-00000000000b', 'p9-member-a@test.local'),
  ('a9000000-0000-0000-0000-00000000000c', 'p9-admin-b@test.local'),
  ('a9000000-0000-0000-0000-00000000000d', 'p9-multi@test.local');
set local session_replication_role = origin;

insert into public.organizations (id, name, branding) values
  ('b9000000-0000-0000-0000-000000000001', 'P9 OrgA',
   '{"display_name":"Org A Display"}'::jsonb),
  ('b9000000-0000-0000-0000-000000000002', 'P9 OrgB',
   '{"display_name":"Org B Display"}'::jsonb);

insert into public.teams (id, org_id, name) values
  ('c9000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000001', 'P9 TeamA'),
  ('c9000000-0000-0000-0000-000000000002', 'b9000000-0000-0000-0000-000000000002', 'P9 TeamB');

insert into public.profiles
  (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('a9000000-0000-0000-0000-00000000000a', 'b9000000-0000-0000-0000-000000000001',
   'c9000000-0000-0000-0000-000000000001', null, 'admin', 'P9Ada', 'A', 'p9ada'),
  ('a9000000-0000-0000-0000-00000000000b', 'b9000000-0000-0000-0000-000000000001',
   'c9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-00000000000a', 'berater', 'P9Bea', 'B', 'p9bea'),
  ('a9000000-0000-0000-0000-00000000000c', 'b9000000-0000-0000-0000-000000000002',
   'c9000000-0000-0000-0000-000000000002', null, 'super_admin', 'P9Cara', 'C', 'p9cara'),
  ('a9000000-0000-0000-0000-00000000000d', 'b9000000-0000-0000-0000-000000000001',
   'c9000000-0000-0000-0000-000000000001', null, 'admin', 'P9Multi', 'M', 'p9multi');

set local session_replication_role = replica;
insert into public.memberships (id, identity_id, org_id, team_id, role, status)
values
  ('d9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-00000000000a',
   'b9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('d9000000-0000-0000-0000-00000000000b', 'a9000000-0000-0000-0000-00000000000b',
   'b9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'berater', 'active'),
  ('d9000000-0000-0000-0000-00000000000c', 'a9000000-0000-0000-0000-00000000000c',
   'b9000000-0000-0000-0000-000000000002', 'c9000000-0000-0000-0000-000000000002', 'super_admin', 'active'),
  ('d9000000-0000-0000-0000-00000000000d', 'a9000000-0000-0000-0000-00000000000d',
   'b9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('d9000000-0000-0000-0000-00000000000e', 'a9000000-0000-0000-0000-00000000000d',
   'b9000000-0000-0000-0000-000000000002', 'c9000000-0000-0000-0000-000000000002', 'berater', 'active');
set local session_replication_role = origin;

insert into public.external_tools
  (org_id, key, name, description, url, share_event_type, sort_order)
values
  ('b9000000-0000-0000-0000-000000000001', 'guide', 'Guide A', null,
   'https://guide-a.example', 'contact_created', 1),
  ('b9000000-0000-0000-0000-000000000002', 'guide', 'Guide B', null,
   'https://guide-b.example', 'contact_created', 1);

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

create or replace function tests.p9_try_update_org_b_branding()
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int;
begin
  update public.organizations
  set branding = branding || '{"hack":"1"}'::jsonb
  where id = 'b9000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function tests.p9_try_update_org_b_branding() to authenticated;

-- TEST A: Org A admin is organization admin
select tests.authenticate_as('a9000000-0000-0000-0000-00000000000a');
select tests.select_org('b9000000-0000-0000-0000-000000000001');
select ok(public.is_organization_admin(), 'TEST A: Org A admin → is_organization_admin');

-- TEST B: Org A member is NOT organization admin
select tests.authenticate_as('a9000000-0000-0000-0000-00000000000b');
select tests.select_org('b9000000-0000-0000-0000-000000000001');
select ok(not public.is_organization_admin(), 'TEST B: Org A member → not org admin');

-- TEST C: Org A admin can update own branding
select tests.authenticate_as('a9000000-0000-0000-0000-00000000000a');
select tests.select_org('b9000000-0000-0000-0000-000000000001');
select lives_ok(
  $$select public.org_admin_update_branding('{"website":"https://orga.example"}'::jsonb)$$,
  'TEST C: Org A admin branding update PASS'
);
select is(
  (select branding->>'website' from public.organizations
   where id = 'b9000000-0000-0000-0000-000000000001'),
  'https://orga.example',
  'TEST C: Org A branding persisted'
);

-- TEST F: forged header to Org B without membership → not admin
select tests.select_org('b9000000-0000-0000-0000-000000000002');
select ok(
  not public.is_organization_admin(),
  'TEST F: forged x-ascendos-org=B without membership → DENY'
);

-- Restore A
select tests.select_org('b9000000-0000-0000-0000-000000000001');

-- TEST D: cannot UPDATE Org B branding row
select is(
  tests.p9_try_update_org_b_branding(),
  0,
  'TEST D: Org A admin cannot UPDATE Org B branding row'
);

-- TEST E: cannot SELECT Org B memberships
select is(
  (
    select count(*)::int from public.memberships
    where org_id = 'b9000000-0000-0000-0000-000000000002'
  ),
  0,
  'TEST E: Org A admin cannot SELECT Org B members'
);

-- TEST G: upsert always uses current_org (ignore foreign org intent)
select lives_ok(
  $$select public.org_admin_upsert_external_tool(
      'fitcheck', 'Fit A', 'https://fit-a.example', 'desc', null, null, 2, true
    )$$,
  'TEST G: upsert tool for current org'
);
select is(
  (
    select count(*)::int from public.external_tools
    where org_id = 'b9000000-0000-0000-0000-000000000002'
      and key = 'fitcheck'
  ),
  0,
  'TEST G: tool not created under Org B'
);
select is(
  (
    select count(*)::int from public.external_tools
    where org_id = 'b9000000-0000-0000-0000-000000000001'
      and key = 'fitcheck'
  ),
  1,
  'TEST G: tool created under Org A only'
);

-- TEST H: multi-org user — admin in A, member in B
select tests.authenticate_as('a9000000-0000-0000-0000-00000000000d');
select tests.select_org('b9000000-0000-0000-0000-000000000001');
select ok(public.is_organization_admin(), 'TEST H: multi-org active A → org admin PASS');
select tests.select_org('b9000000-0000-0000-0000-000000000002');
select ok(not public.is_organization_admin(), 'TEST H: multi-org active B (member) → DENY');

-- TEST I/J: platform_admins denied for org admin
select tests.authenticate_as('a9000000-0000-0000-0000-00000000000a');
select tests.select_org('b9000000-0000-0000-0000-000000000001');
select ok(not public.is_platform_super_admin(), 'TEST I: org admin is not platform admin');
select is(
  (select count(*)::int from public.platform_admins),
  0,
  'TEST J: org admin SELECT platform_admins → empty/deny'
);
select throws_ok(
  $$insert into public.platform_admins (identity_id, notes)
    values ('a9000000-0000-0000-0000-00000000000a', 'nope')$$,
  '42501',
  null,
  'TEST J: org admin INSERT platform_admins → DENY'
);

-- Member cannot call branding RPC
select tests.authenticate_as('a9000000-0000-0000-0000-00000000000b');
select tests.select_org('b9000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.org_admin_update_branding('{"website":"https://member.example"}'::jsonb)$$,
  '42501',
  null,
  'TEST B-RPC: member branding → 403'
);

-- Org A admin cannot set membership status on Org B membership id
select tests.authenticate_as('a9000000-0000-0000-0000-00000000000a');
select tests.select_org('b9000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.org_admin_set_membership_status(
      'd9000000-0000-0000-0000-00000000000c', 'suspended'
    )$$,
  'P0001',
  null,
  'TEST E-RPC: cannot change Org B membership status'
);

-- organizations.name protected
select throws_ok(
  $$update public.organizations
    set name = 'Hacked'
    where id = 'b9000000-0000-0000-0000-000000000001'$$,
  'P0001',
  null,
  'ADR 0007: organizations.name cannot be changed'
);

-- Org1 seed continuity
select ok(
  exists (
    select 1 from public.organizations
    where id = '00000000-0000-0000-0000-000000000001'
  ),
  'Org1 (Chogan) remains present'
);

select * from finish();
rollback;
