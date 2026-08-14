-- ============================================================
-- Phase 11: Billing + usage security (pgTAP)
-- Migration: 20260907000051_phase11_billing_usage.sql
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('aa110000-0000-0000-0000-00000000000a', 'p11-plat@test.local'),
  ('aa110000-0000-0000-0000-00000000000b', 'p11-admin-a@test.local'),
  ('aa110000-0000-0000-0000-00000000000c', 'p11-admin-b@test.local'),
  ('aa110000-0000-0000-0000-00000000000d', 'p11-member@test.local'),
  ('aa110000-0000-0000-0000-00000000000e', 'p11-multi@test.local');
set local session_replication_role = origin;

insert into public.organizations (id, name, branding, status) values
  ('bb110000-0000-0000-0000-000000000001', 'P11 OrgA',
   '{"display_name":"Org A"}'::jsonb, 'active'),
  ('bb110000-0000-0000-0000-000000000002', 'P11 OrgB',
   '{"display_name":"Org B"}'::jsonb, 'active');

insert into public.teams (id, org_id, name) values
  ('cc110000-0000-0000-0000-000000000001', 'bb110000-0000-0000-0000-000000000001', 'P11 TeamA'),
  ('cc110000-0000-0000-0000-000000000002', 'bb110000-0000-0000-0000-000000000002', 'P11 TeamB');

insert into public.profiles
  (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('aa110000-0000-0000-0000-00000000000a', 'bb110000-0000-0000-0000-000000000001',
   'cc110000-0000-0000-0000-000000000001', null, 'berater', 'Plat', 'A', 'p11plat'),
  ('aa110000-0000-0000-0000-00000000000b', 'bb110000-0000-0000-0000-000000000001',
   'cc110000-0000-0000-0000-000000000001', null, 'admin', 'Admin', 'A', 'p11ada'),
  ('aa110000-0000-0000-0000-00000000000c', 'bb110000-0000-0000-0000-000000000002',
   'cc110000-0000-0000-0000-000000000002', null, 'admin', 'Admin', 'B', 'p11adb'),
  ('aa110000-0000-0000-0000-00000000000d', 'bb110000-0000-0000-0000-000000000001',
   'cc110000-0000-0000-0000-000000000001', 'aa110000-0000-0000-0000-00000000000b',
   'berater', 'Mem', 'A', 'p11mem'),
  ('aa110000-0000-0000-0000-00000000000e', 'bb110000-0000-0000-0000-000000000001',
   'cc110000-0000-0000-0000-000000000001', null, 'admin', 'Multi', 'M', 'p11multi');

set local session_replication_role = replica;
insert into public.memberships (id, identity_id, org_id, team_id, role, status)
values
  ('dd110000-0000-0000-0000-00000000000a', 'aa110000-0000-0000-0000-00000000000a',
   'bb110000-0000-0000-0000-000000000001', 'cc110000-0000-0000-0000-000000000001', 'berater', 'active'),
  ('dd110000-0000-0000-0000-00000000000b', 'aa110000-0000-0000-0000-00000000000b',
   'bb110000-0000-0000-0000-000000000001', 'cc110000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('dd110000-0000-0000-0000-00000000000c', 'aa110000-0000-0000-0000-00000000000c',
   'bb110000-0000-0000-0000-000000000002', 'cc110000-0000-0000-0000-000000000002', 'admin', 'active'),
  ('dd110000-0000-0000-0000-00000000000d', 'aa110000-0000-0000-0000-00000000000d',
   'bb110000-0000-0000-0000-000000000001', 'cc110000-0000-0000-0000-000000000001', 'berater', 'active'),
  ('dd110000-0000-0000-0000-00000000000e', 'aa110000-0000-0000-0000-00000000000e',
   'bb110000-0000-0000-0000-000000000001', 'cc110000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('dd110000-0000-0000-0000-00000000000f', 'aa110000-0000-0000-0000-00000000000e',
   'bb110000-0000-0000-0000-000000000002', 'cc110000-0000-0000-0000-000000000002', 'berater', 'active'),
  ('dd110000-0000-0000-0000-000000000010', 'aa110000-0000-0000-0000-00000000000d',
   'bb110000-0000-0000-0000-000000000001', 'cc110000-0000-0000-0000-000000000001', 'berater', 'suspended'),
  ('dd110000-0000-0000-0000-000000000011', 'aa110000-0000-0000-0000-00000000000d',
   'bb110000-0000-0000-0000-000000000001', 'cc110000-0000-0000-0000-000000000001', 'berater', 'pending');
set local session_replication_role = origin;

-- Bootstrap billing after replica inserts (triggers skipped under replica)
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '', true);
select public.ensure_org_billing('bb110000-0000-0000-0000-000000000001');
select public.ensure_org_billing('bb110000-0000-0000-0000-000000000002');

insert into public.platform_admins (identity_id, notes)
values ('aa110000-0000-0000-0000-00000000000a', 'p11 platform');

insert into public.usage_events (user_id, org_id, event_type, metadata)
values
  ('aa110000-0000-0000-0000-00000000000b', 'bb110000-0000-0000-0000-000000000001',
   'coach_message_sent', '{}'::jsonb),
  ('aa110000-0000-0000-0000-00000000000c', 'bb110000-0000-0000-0000-000000000002',
   'coach_message_sent', '{}'::jsonb);

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

-- Money matrix (cents)
select is(public.billing_estimate_monthly_cents(0), 2000, '0 members → 20€');
select is(public.billing_estimate_monthly_cents(1), 2200, '1 member → 22€');
select is(public.billing_estimate_monthly_cents(10), 4000, '10 members → 40€');
select is(public.billing_estimate_monthly_cents(50), 12000, '50 members → 120€');
select is(public.billing_estimate_monthly_cents(200), 42000, '200 members → 420€');
select is(public.billing_estimate_monthly_cents(1000), 202000, '1000 members → 2020€');

-- TEST A: Platform Admin billing overview
select tests.authenticate_as('aa110000-0000-0000-0000-00000000000a');
select ok(
  (select count(*)::int from public.platform_list_billing(null)) >= 2,
  'TEST A: Platform Admin → billing overview PASS'
);

-- TEST B: Org Admin A billing PASS
select tests.authenticate_as('aa110000-0000-0000-0000-00000000000b');
select tests.select_org('bb110000-0000-0000-0000-000000000001');
select lives_ok(
  $$select public.org_admin_get_billing()$$,
  'TEST B: Org Admin A → billing PASS'
);
select is(
  (public.org_admin_get_billing()->>'organization_id')::uuid,
  'bb110000-0000-0000-0000-000000000001'::uuid,
  'TEST B: billing scoped to Org A'
);

-- Seat count: active only (pending/suspended ignored)
-- Active in A: plat, admin-a, member, multi = 4 (suspended+pending rows don't count)
select is(
  public.billing_count_active_seats('bb110000-0000-0000-0000-000000000001'),
  4,
  'TEST E/F/G: Org A active seats exclude pending/suspended'
);

-- TEST C: Org Admin A cannot see Org B billing rows
select is(
  (select count(*)::int from public.org_billing_accounts
   where organization_id = 'bb110000-0000-0000-0000-000000000002'),
  0,
  'TEST C: Org Admin A → Billing B DENY (RLS empty)'
);

-- TEST D: Member denied billing RPC
select tests.authenticate_as('aa110000-0000-0000-0000-00000000000d');
select tests.select_org('bb110000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.org_admin_get_billing()$$,
  '42501',
  null,
  'TEST D: Member → billing DENY'
);

-- TEST H: multi-org counts once per org
select tests.authenticate_as('aa110000-0000-0000-0000-00000000000a');
select is(
  (
    select active_seats from public.platform_list_billing(null)
    where organization_id = 'bb110000-0000-0000-0000-000000000002'
  ),
  2,
  'TEST H: Org B seats include multi-org user once'
);

-- TEST I: forged organization_id via seat count as Org A admin
select tests.authenticate_as('aa110000-0000-0000-0000-00000000000b');
select tests.select_org('bb110000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.billing_count_active_seats('bb110000-0000-0000-0000-000000000002')$$,
  '42501',
  null,
  'TEST I: forged organization_id seat count DENY'
);

-- TEST J: forged header to B without membership → not org admin billing
select tests.select_org('bb110000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.org_admin_get_billing()$$,
  '42501',
  null,
  'TEST J: forged x-ascendos-org → billing DENY'
);

-- Restore A
select tests.select_org('bb110000-0000-0000-0000-000000000001');

-- TEST K/L: usage attribution org scoped
select is(
  (public.org_admin_get_usage()->>'coach_messages')::int,
  1,
  'TEST K: Org A usage coach_messages = 1'
);
select is(
  (select count(*)::int from public.usage_events
   where org_id = 'bb110000-0000-0000-0000-000000000002'),
  0,
  'TEST L prep: Org A admin cannot SELECT Org B usage rows'
);

-- TEST M: Platform sees A+B usage via platform overview policy
select tests.authenticate_as('aa110000-0000-0000-0000-00000000000a');
select is(
  (select count(*)::int from public.usage_events
   where org_id in (
     'bb110000-0000-0000-0000-000000000001',
     'bb110000-0000-0000-0000-000000000002'
   )),
  2,
  'TEST M: Platform Admin sees A + B usage'
);

-- TEST N: Org Admin A usage only A
select tests.authenticate_as('aa110000-0000-0000-0000-00000000000b');
select tests.select_org('bb110000-0000-0000-0000-000000000001');
select is(
  (public.org_admin_get_usage()->>'organization_id')::uuid,
  'bb110000-0000-0000-0000-000000000001'::uuid,
  'TEST N: Org Admin usage scoped to A'
);

-- Billing account + subscription + items exist
reset role;
select ok(
  exists (
    select 1 from public.org_subscriptions s
    join public.org_subscription_items i on i.subscription_id = s.id
    where s.organization_id = 'bb110000-0000-0000-0000-000000000001'
      and i.item_type = 'base' and i.quantity = 1 and i.unit_price_cents = 2000
  ),
  'Subscription base item 20€'
);
select ok(
  exists (
    select 1 from public.org_subscription_items i
    join public.org_subscriptions s on s.id = i.subscription_id
    where s.organization_id = 'bb110000-0000-0000-0000-000000000001'
      and i.item_type = 'seat' and i.unit_price_cents = 200
  ),
  'Subscription seat item 2€'
);

-- Config defaults
select tests.authenticate_as('aa110000-0000-0000-0000-00000000000a');
select is(
  (public.billing_get_config()->>'base_price_cents')::int,
  2000,
  'Config base_price_cents = 2000'
);

-- Member cannot platform list billing
select tests.authenticate_as('aa110000-0000-0000-0000-00000000000d');
select throws_ok(
  $$select * from public.platform_list_billing(null)$$,
  '42501',
  null,
  'Member → platform billing DENY'
);

-- Multi-org user admin in A only
select tests.authenticate_as('aa110000-0000-0000-0000-00000000000e');
select tests.select_org('bb110000-0000-0000-0000-000000000001');
select lives_ok($$select public.org_admin_get_billing()$$, 'Multi-org active A → billing PASS');
select tests.select_org('bb110000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.org_admin_get_billing()$$,
  '42501',
  null,
  'Multi-org active B (member) → billing DENY'
);

select * from finish();
rollback;
