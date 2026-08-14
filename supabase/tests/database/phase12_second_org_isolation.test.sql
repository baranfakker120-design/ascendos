-- ============================================================
-- Phase 12: Second Organization + Full Tenant Isolation (pgTAP)
-- TEST/CI FIXTURES ONLY — does NOT create a production Org B.
-- Migration: NONE (coverage of Phases 2–11 isolation surface)
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(90);

-- ---------- Fixtures (isolated test identities) ----------
set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('aa120000-0000-0000-0000-0000000000a1', 'p12-admin-a@test.local'),
  ('aa120000-0000-0000-0000-0000000000b1', 'p12-admin-b@test.local'),
  ('aa120000-0000-0000-0000-0000000000a2', 'p12-member-a@test.local'),
  ('aa120000-0000-0000-0000-0000000000b2', 'p12-member-b@test.local'),
  ('aa120000-0000-0000-0000-0000000000ab', 'p12-multi@test.local'),
  ('aa120000-0000-0000-0000-0000000000p1', 'p12-platform@test.local');
set local session_replication_role = origin;

-- Org A = test stand-in for existing tenant (not mutating real Org #1 rows)
-- Org B = AscendOS Isolation Test Org (neutral branding; no Team Seyda defaults)
insert into public.organizations (id, name, branding, status) values
  ('bb120000-0000-0000-0000-000000000001', 'P12 Org A Stand-in',
   jsonb_build_object(
     'display_name', 'Org A Test',
     'coachDisplayName', 'Coach A',
     'guideUrl', 'https://org-a-guide.test',
     'primaryColor', '#111111'
   ), 'active'),
  ('bb120000-0000-0000-0000-000000000002', 'AscendOS Isolation Test Org',
   jsonb_build_object(
     'display_name', 'Isolation Test Org',
     'coachDisplayName', 'Coach B',
     'logoUrl', 'https://isolation-test.example/logo.png',
     'primaryColor', '#00aa55',
     'guideUrl', 'https://isolation-guide.test'
   ), 'active');

insert into public.teams (id, org_id, name) values
  ('cc120000-0000-0000-0000-000000000001', 'bb120000-0000-0000-0000-000000000001', 'P12 Team A'),
  ('cc120000-0000-0000-0000-000000000002', 'bb120000-0000-0000-0000-000000000002', 'P12 Team B');

insert into public.profiles
  (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('aa120000-0000-0000-0000-0000000000a1', 'bb120000-0000-0000-0000-000000000001',
   'cc120000-0000-0000-0000-000000000001', null, 'super_admin', 'P12A', 'Admin', 'p12aadmin'),
  ('aa120000-0000-0000-0000-0000000000b1', 'bb120000-0000-0000-0000-000000000002',
   'cc120000-0000-0000-0000-000000000002', null, 'super_admin', 'P12B', 'Admin', 'p12badmin'),
  ('aa120000-0000-0000-0000-0000000000a2', 'bb120000-0000-0000-0000-000000000001',
   'cc120000-0000-0000-0000-000000000001', 'aa120000-0000-0000-0000-0000000000a1',
   'berater', 'P12A', 'Mem', 'p12amem'),
  ('aa120000-0000-0000-0000-0000000000b2', 'bb120000-0000-0000-0000-000000000002',
   'cc120000-0000-0000-0000-000000000002', 'aa120000-0000-0000-0000-0000000000b1',
   'berater', 'P12B', 'Mem', 'p12bmem'),
  ('aa120000-0000-0000-0000-0000000000ab', 'bb120000-0000-0000-0000-000000000001',
   'cc120000-0000-0000-0000-000000000001', null, 'super_admin', 'P12', 'Multi', 'p12multi'),
  ('aa120000-0000-0000-0000-0000000000p1', 'bb120000-0000-0000-0000-000000000001',
   'cc120000-0000-0000-0000-000000000001', null, 'berater', 'P12', 'Plat', 'p12plat');

set local session_replication_role = replica;
insert into public.memberships (id, identity_id, org_id, team_id, role, status)
values
  ('dd120000-0000-0000-0000-0000000000a1', 'aa120000-0000-0000-0000-0000000000a1',
   'bb120000-0000-0000-0000-000000000001', 'cc120000-0000-0000-0000-000000000001',
   'super_admin', 'active'),
  ('dd120000-0000-0000-0000-0000000000b1', 'aa120000-0000-0000-0000-0000000000b1',
   'bb120000-0000-0000-0000-000000000002', 'cc120000-0000-0000-0000-000000000002',
   'super_admin', 'active'),
  ('dd120000-0000-0000-0000-0000000000a2', 'aa120000-0000-0000-0000-0000000000a2',
   'bb120000-0000-0000-0000-000000000001', 'cc120000-0000-0000-0000-000000000001',
   'berater', 'active'),
  ('dd120000-0000-0000-0000-0000000000b2', 'aa120000-0000-0000-0000-0000000000b2',
   'bb120000-0000-0000-0000-000000000002', 'cc120000-0000-0000-0000-000000000002',
   'berater', 'active'),
  ('dd120000-0000-0000-0000-0000000000aa', 'aa120000-0000-0000-0000-0000000000ab',
   'bb120000-0000-0000-0000-000000000001', 'cc120000-0000-0000-0000-000000000001',
   'super_admin', 'active'),
  ('dd120000-0000-0000-0000-0000000000bb', 'aa120000-0000-0000-0000-0000000000ab',
   'bb120000-0000-0000-0000-000000000002', 'cc120000-0000-0000-0000-000000000002',
   'berater', 'active'),
  ('dd120000-0000-0000-0000-0000000000p1', 'aa120000-0000-0000-0000-0000000000p1',
   'bb120000-0000-0000-0000-000000000001', 'cc120000-0000-0000-0000-000000000001',
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

create or replace function tests.clear_org_header()
returns void language plpgsql as $$
begin
  perform set_config('request.headers', '{}', true);
end;
$$;

-- Seed as owner (bypass RLS)
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '', true);

insert into public.platform_admins (identity_id, notes)
values ('aa120000-0000-0000-0000-0000000000p1', 'p12 platform');

select public.ensure_org_billing('bb120000-0000-0000-0000-000000000001');
select public.ensure_org_billing('bb120000-0000-0000-0000-000000000002');

insert into public.agents (id, org_id, key, name, system_prompt, retrieval_categories)
values
  ('ee120000-0000-0000-0000-0000000000a1', 'bb120000-0000-0000-0000-000000000001',
   'knowledge', 'Coach A', 'COACH_A_PROMPT ORG_A_SECRET_MARKER', array['faq']),
  ('ee120000-0000-0000-0000-0000000000b1', 'bb120000-0000-0000-0000-000000000002',
   'knowledge', 'Coach B', 'COACH_B_PROMPT ORG_B_SECRET_MARKER', array['faq']);

insert into public.knowledge_docs
  (id, org_id, title, category, status, source_type)
values
  ('ee120000-0000-0000-0000-0000000000d1', 'bb120000-0000-0000-0000-000000000001',
   'Doc A Marker', 'faq', 'approved', 'document'),
  ('ee120000-0000-0000-0000-0000000000d2', 'bb120000-0000-0000-0000-000000000002',
   'Doc B Marker', 'faq', 'approved', 'document');

insert into public.knowledge_chunks (id, doc_id, org_id, chunk_index, content, embedding)
values
  ('ee120000-0000-0000-0000-0000000000c1', 'ee120000-0000-0000-0000-0000000000d1',
   'bb120000-0000-0000-0000-000000000001', 0,
   'ORG_A_SECRET_MARKER knowledge-body',
   array_fill(0.1::real, array[1536])::extensions.vector(1536)),
  ('ee120000-0000-0000-0000-0000000000c2', 'ee120000-0000-0000-0000-0000000000d2',
   'bb120000-0000-0000-0000-000000000002', 0,
   'ORG_B_SECRET_MARKER knowledge-body',
   array_fill(0.1::real, array[1536])::extensions.vector(1536));

insert into public.knowledge_gaps (org_id, user_id, agent_key, question)
values
  ('bb120000-0000-0000-0000-000000000001', 'aa120000-0000-0000-0000-0000000000a1',
   'knowledge', 'gap-a ORG_A_SECRET_MARKER'),
  ('bb120000-0000-0000-0000-000000000002', 'aa120000-0000-0000-0000-0000000000b1',
   'knowledge', 'gap-b ORG_B_SECRET_MARKER');

insert into public.coach_knowledge_articles
  (id, org_id, title, slug, body_markdown, category, status, active, approved_at)
values
  ('ee120000-0000-0000-0000-0000000000e1', 'bb120000-0000-0000-0000-000000000001',
   'CMS A', 'p12-cms-a', 'ORG_A_SECRET_MARKER cms', 'Allgemein', 'approved', true, now()),
  ('ee120000-0000-0000-0000-0000000000e2', 'bb120000-0000-0000-0000-000000000002',
   'CMS B', 'p12-cms-b', 'ORG_B_SECRET_MARKER cms', 'Allgemein', 'approved', true, now());

insert into public.coach_convos (id, user_id, org_id, agent_key)
values
  ('ee120000-0000-0000-0000-0000000000f1', 'aa120000-0000-0000-0000-0000000000ab',
   'bb120000-0000-0000-0000-000000000001', 'knowledge'),
  ('ee120000-0000-0000-0000-0000000000f2', 'aa120000-0000-0000-0000-0000000000ab',
   'bb120000-0000-0000-0000-000000000002', 'knowledge');

insert into public.coach_messages (convo_id, role, content)
values
  ('ee120000-0000-0000-0000-0000000000f1', 'user', 'ORG_A_SECRET_MARKER convo'),
  ('ee120000-0000-0000-0000-0000000000f2', 'user', 'ORG_B_SECRET_MARKER convo');

insert into public.live_coaching_events
  (id, org_id, title, starts_at, media_type, media_path, media_url, active)
values
  ('ee120000-0000-0000-0000-000000000031', 'bb120000-0000-0000-0000-000000000001',
   'Event A ORG_A_SECRET_MARKER', now() + interval '3 days', 'image',
   'bb120000-0000-0000-0000-000000000001/flyer-a.jpg', null, true),
  ('ee120000-0000-0000-0000-000000000032', 'bb120000-0000-0000-0000-000000000002',
   'Event B ORG_B_SECRET_MARKER', now() + interval '3 days', 'image',
   'bb120000-0000-0000-0000-000000000002/flyer-b.jpg', null, true);

insert into public.coaching_notification_outbox
  (id, org_id, event_id, kind, scheduled_for, title, body)
values
  ('ee120000-0000-0000-0000-000000000041', 'bb120000-0000-0000-0000-000000000001',
   'ee120000-0000-0000-0000-000000000031', 't_minus_30', now() + interval '2 days',
   'Push A', 'ORG_A_SECRET_MARKER push'),
  ('ee120000-0000-0000-0000-000000000042', 'bb120000-0000-0000-0000-000000000002',
   'ee120000-0000-0000-0000-000000000032', 't_minus_30', now() + interval '2 days',
   'Push B', 'ORG_B_SECRET_MARKER push');

insert into public.ascend_stories
  (id, org_id, story_type, title, body, published_at, expires_at, active)
values
  ('ee120000-0000-0000-0000-000000000051', 'bb120000-0000-0000-0000-000000000001',
   'achievements', 'Story A', 'ORG_A_SECRET_MARKER story', now(), now() + interval '1 day', true),
  ('ee120000-0000-0000-0000-000000000052', 'bb120000-0000-0000-0000-000000000002',
   'achievements', 'Story B', 'ORG_B_SECRET_MARKER story', now(), now() + interval '1 day', true);

insert into public.external_tools
  (id, org_id, key, name, description, url, share_event_type, sort_order, is_active)
values
  ('ee120000-0000-0000-0000-000000000061', 'bb120000-0000-0000-0000-000000000001',
   'onboarding', 'Tool A', 'A tool', 'https://org-a-tool.test', 'presentation_sent', 1, true),
  ('ee120000-0000-0000-0000-000000000062', 'bb120000-0000-0000-0000-000000000002',
   'onboarding', 'Tool B', 'B tool', 'https://isolation-tool.test', 'presentation_sent', 1, true);

insert into public.contacts (id, owner_id, org_id, name, notes)
values
  ('ee120000-0000-0000-0000-000000000071', 'aa120000-0000-0000-0000-0000000000a1',
   'bb120000-0000-0000-0000-000000000001', 'Contact A', 'ORG_A_SECRET_MARKER'),
  ('ee120000-0000-0000-0000-000000000072', 'aa120000-0000-0000-0000-0000000000b1',
   'bb120000-0000-0000-0000-000000000002', 'Contact B', 'ORG_B_SECRET_MARKER');

insert into public.pipeline_events (id, contact_id, org_id, event_type)
values
  ('ee120000-0000-0000-0000-000000000081', 'ee120000-0000-0000-0000-000000000071',
   'bb120000-0000-0000-0000-000000000001', 'contact_created'),
  ('ee120000-0000-0000-0000-000000000082', 'ee120000-0000-0000-0000-000000000072',
   'bb120000-0000-0000-0000-000000000002', 'contact_created');

insert into public.daily_plans (id, user_id, org_id, plan_date)
values
  ('ee120000-0000-0000-0000-000000000091', 'aa120000-0000-0000-0000-0000000000a1',
   'bb120000-0000-0000-0000-000000000001', current_date),
  ('ee120000-0000-0000-0000-000000000092', 'aa120000-0000-0000-0000-0000000000b1',
   'bb120000-0000-0000-0000-000000000002', current_date);

insert into public.daily_plan_items
  (id, plan_id, mission_type, title, reason, score, position)
values
  ('ee120000-0000-0000-0000-000000000093', 'ee120000-0000-0000-0000-000000000091',
   'new_contacts', 'Plan A', 'ORG_A_SECRET_MARKER', 1, 1),
  ('ee120000-0000-0000-0000-000000000094', 'ee120000-0000-0000-0000-000000000092',
   'new_contacts', 'Plan B', 'ORG_B_SECRET_MARKER', 1, 1);

insert into public.content_assets
  (id, org_id, owner_membership_id, created_by, scope, media_kind, storage_path,
   file_name, mime_type, byte_size, title)
values
  ('ee120000-0000-0000-0000-0000000000a1', 'bb120000-0000-0000-0000-000000000001',
   'dd120000-0000-0000-0000-0000000000a1', 'aa120000-0000-0000-0000-0000000000a1',
   'central', 'image',
   'bb120000-0000-0000-0000-000000000001/asset-a.jpg',
   'asset-a.jpg', 'image/jpeg', 1024, 'Asset A'),
  ('ee120000-0000-0000-0000-0000000000a2', 'bb120000-0000-0000-0000-000000000002',
   'dd120000-0000-0000-0000-0000000000b1', 'aa120000-0000-0000-0000-0000000000b1',
   'central', 'image',
   'bb120000-0000-0000-0000-000000000002/asset-b.jpg',
   'asset-b.jpg', 'image/jpeg', 1024, 'Asset B');

insert into public.content_instagram_connections
  (id, org_id, membership_id, ig_username, status, token_ref)
values
  ('ee120000-0000-0000-0000-0000000000i1', 'bb120000-0000-0000-0000-000000000001',
   'dd120000-0000-0000-0000-0000000000a1', 'ig_a_test', 'connected', 'vault:org-a-token'),
  ('ee120000-0000-0000-0000-0000000000i2', 'bb120000-0000-0000-0000-000000000002',
   'dd120000-0000-0000-0000-0000000000b1', 'ig_b_test', 'connected', 'vault:org-b-token');

insert into public.content_facebook_business_connections
  (id, org_id, membership_id, status)
values
  ('ee120000-0000-0000-0000-0000000000fb', 'bb120000-0000-0000-0000-000000000001',
   'dd120000-0000-0000-0000-0000000000a1', 'disconnected'),
  ('ee120000-0000-0000-0000-0000000000fc', 'bb120000-0000-0000-0000-000000000002',
   'dd120000-0000-0000-0000-0000000000b1', 'disconnected');

insert into public.content_autopilot_settings
  (id, org_id, membership_id, enabled)
values
  ('ee120000-0000-0000-0000-0000000000s1', 'bb120000-0000-0000-0000-000000000001',
   'dd120000-0000-0000-0000-0000000000a1', false),
  ('ee120000-0000-0000-0000-0000000000s2', 'bb120000-0000-0000-0000-000000000002',
   'dd120000-0000-0000-0000-0000000000b1', false);

insert into public.content_autopilot_plans
  (id, org_id, membership_id, period_start, period_end, status)
values
  ('ee120000-0000-0000-0000-0000000000p1', 'bb120000-0000-0000-0000-000000000001',
   'dd120000-0000-0000-0000-0000000000a1', current_date, current_date + 6, 'active'),
  ('ee120000-0000-0000-0000-0000000000p2', 'bb120000-0000-0000-0000-000000000002',
   'dd120000-0000-0000-0000-0000000000b1', current_date, current_date + 6, 'active');

insert into public.content_autopilot_slots
  (id, org_id, membership_id, plan_id, asset_id, carousel_asset_ids,
   planned_for, slot_kind, content_format, status)
values
  ('ee120000-0000-0000-0000-0000000000l1', 'bb120000-0000-0000-0000-000000000001',
   'dd120000-0000-0000-0000-0000000000a1', 'ee120000-0000-0000-0000-0000000000p1',
   'ee120000-0000-0000-0000-0000000000a1', '{}'::uuid[],
   now() + interval '1 day', 'feed', 'feed', 'planned'),
  ('ee120000-0000-0000-0000-0000000000l2', 'bb120000-0000-0000-0000-000000000002',
   'dd120000-0000-0000-0000-0000000000b1', 'ee120000-0000-0000-0000-0000000000p2',
   'ee120000-0000-0000-0000-0000000000a2', '{}'::uuid[],
   now() + interval '1 day', 'feed', 'feed', 'planned');

insert into public.ap_task_defs (id, org_id, key, title, ap)
values
  ('ee120000-0000-0000-0000-0000000000t1', 'bb120000-0000-0000-0000-000000000001',
   'p12_a', 'AP Task A', 10),
  ('ee120000-0000-0000-0000-0000000000t2', 'bb120000-0000-0000-0000-000000000002',
   'p12_b', 'AP Task B', 10);

insert into public.usage_events (user_id, org_id, event_type, metadata)
values
  ('aa120000-0000-0000-0000-0000000000a1', 'bb120000-0000-0000-0000-000000000001',
   'coach_message_sent', '{"marker":"ORG_A_SECRET_MARKER"}'::jsonb),
  ('aa120000-0000-0000-0000-0000000000b1', 'bb120000-0000-0000-0000-000000000002',
   'coach_message_sent', '{"marker":"ORG_B_SECRET_MARKER"}'::jsonb);

-- ============================================================
-- 0) Data preservation + Org B identity
-- ============================================================

select ok(
  exists (
    select 1 from public.organizations
    where id = '00000000-0000-0000-0000-000000000001'
  ),
  'Org #1 seed preserved (production Org A stand-in untouched)'
);

select is(
  (select name from public.organizations
   where id = 'bb120000-0000-0000-0000-000000000002'),
  'AscendOS Isolation Test Org',
  'Org B test fixture name is AscendOS Isolation Test Org'
);

select is(
  (select branding->>'display_name' from public.organizations
   where id = 'bb120000-0000-0000-0000-000000000002'),
  'Isolation Test Org',
  'Org B branding.display_name = Isolation Test Org'
);

select ok(
  (select branding::text not ilike '%team%seyda%'
     and branding::text not ilike '%waytomoon%'
     and branding::text not ilike '%essence%tribe%'
     and branding::text not ilike '%chogan%'
   from public.organizations
   where id = 'bb120000-0000-0000-0000-000000000002'),
  'Org B branding has no Team Seyda / WayToMoon / Essence Tribe / Chogan defaults'
);

-- ============================================================
-- 1) Organization resolution + forged headers + multi-org
-- ============================================================

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000a1');
select tests.select_org('bb120000-0000-0000-0000-000000000001');
select is(public.current_org_id(),
  'bb120000-0000-0000-0000-000000000001'::uuid,
  'User A + header A → current_org_id = A');

select tests.select_org('bb120000-0000-0000-0000-000000000002');
select is(public.current_org_id(), null::uuid,
  'User A + forged header B → DENY (NULL org)');

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000b1');
select tests.select_org('bb120000-0000-0000-0000-000000000002');
select is(public.current_org_id(),
  'bb120000-0000-0000-0000-000000000002'::uuid,
  'User B + header B → current_org_id = B');

select tests.select_org('bb120000-0000-0000-0000-000000000001');
select is(public.current_org_id(), null::uuid,
  'User B + forged header A → DENY (NULL org)');

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000ab');
select tests.select_org('bb120000-0000-0000-0000-000000000001');
select is(public.current_org_id(),
  'bb120000-0000-0000-0000-000000000001'::uuid,
  'MULTI header A → Org A');

select tests.select_org('bb120000-0000-0000-0000-000000000002');
select is(public.current_org_id(),
  'bb120000-0000-0000-0000-000000000002'::uuid,
  'MULTI header B → Org B');

select tests.clear_org_header();
select is(public.current_org_id(), null::uuid,
  'MULTI no header → DENY (Fall 4, never profiles.org_id)');
select is(public.active_membership_id(), null::uuid,
  'MULTI no header → active_membership_id NULL');

-- ============================================================
-- 2) Coach / agent isolation
-- ============================================================

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000a1');
select tests.select_org('bb120000-0000-0000-0000-000000000001');
select is(
  (select name from public.agents where key = 'knowledge'),
  'Coach A',
  'Org A → Coach A'
);
select is(
  (select count(*)::int from public.agents where name = 'Coach B'),
  0,
  'Org A does not see Coach B'
);

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000b1');
select tests.select_org('bb120000-0000-0000-0000-000000000002');
select is(
  (select name from public.agents where key = 'knowledge'),
  'Coach B',
  'Org B → Coach B'
);
select is(
  (select count(*)::int from public.agents where name = 'Coach A'),
  0,
  'Org B does not see Coach A'
);

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000ab');
select tests.select_org('bb120000-0000-0000-0000-000000000001');
select is((select name from public.agents where key = 'knowledge'), 'Coach A',
  'MULTI header A → Coach A');
select tests.select_org('bb120000-0000-0000-0000-000000000002');
select is((select name from public.agents where key = 'knowledge'), 'Coach B',
  'MULTI header B → Coach B');

-- ============================================================
-- 3) Knowledge + match_knowledge secret markers
-- ============================================================

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000a1');
select tests.select_org('bb120000-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.knowledge_chunks
   where content like '%ORG_A_SECRET_MARKER%'),
  1,
  'A sees ORG_A_SECRET_MARKER chunk'
);
select is(
  (select count(*)::int from public.knowledge_chunks
   where content like '%ORG_B_SECRET_MARKER%'),
  0,
  'A never sees ORG_B_SECRET_MARKER chunk'
);

select is(
  (select count(*)::int from public.match_knowledge(
     array_fill(0.1::real, array[1536])::extensions.vector(1536),
     'bb120000-0000-0000-0000-000000000001'::uuid,
     null, 5, 0.0)
   where content like '%ORG_B_SECRET_MARKER%'),
  0,
  'A match_knowledge never returns B marker'
);

select throws_like(
  $$ select * from public.match_knowledge(
       array_fill(0.1::real, array[1536])::extensions.vector(1536),
       'bb120000-0000-0000-0000-000000000002'::uuid,
       null, 5, 0.0) $$,
  '%fremdes Organisationswissen%',
  'A cannot forge p_org_id=B on match_knowledge'
);

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000b1');
select tests.select_org('bb120000-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from public.knowledge_chunks
   where content like '%ORG_B_SECRET_MARKER%'),
  1,
  'B sees ORG_B_SECRET_MARKER chunk'
);
select is(
  (select count(*)::int from public.knowledge_chunks
   where content like '%ORG_A_SECRET_MARKER%'),
  0,
  'B never sees ORG_A_SECRET_MARKER chunk'
);

select is(
  (select count(*)::int from public.coach_knowledge_articles
   where body_markdown like '%ORG_A_SECRET_MARKER%'),
  0,
  'B CMS never sees A marker'
);

-- ============================================================
-- 4) Conversations
-- ============================================================

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000ab');
select tests.select_org('bb120000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.coach_convos
   where id = 'ee120000-0000-0000-0000-0000000000f1'),
  1, 'MULTI@A sees convo A'
);
select is(
  (select count(*)::int from public.coach_convos
   where id = 'ee120000-0000-0000-0000-0000000000f2'),
  0, 'MULTI@A cannot see convo B'
);
select is(
  (select count(*)::int from public.coach_messages
   where content like '%ORG_B_SECRET_MARKER%'),
  0, 'MULTI@A cannot see B messages'
);

select tests.select_org('bb120000-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from public.coach_convos
   where id = 'ee120000-0000-0000-0000-0000000000f2'),
  1, 'MULTI@B sees convo B'
);
select is(
  (select count(*)::int from public.coach_messages
   where content like '%ORG_A_SECRET_MARKER%'),
  0, 'MULTI@B cannot see A messages'
);

-- ============================================================
-- 5) Live coaching + push outbox + stories
-- ============================================================

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000a2');
select tests.select_org('bb120000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.live_coaching_events
   where title like '%ORG_A_SECRET_MARKER%'),
  1, 'Member A sees Event A'
);
select is(
  (select count(*)::int from public.live_coaching_events
   where title like '%ORG_B_SECRET_MARKER%'),
  0, 'Member A does not see Event B'
);
select is(
  (select count(*)::int from public.coaching_notification_outbox
   where body like '%ORG_B_SECRET_MARKER%'),
  0, 'Member A does not see Push B outbox'
);
select is(
  (select count(*)::int from public.ascend_stories where title = 'Story B'),
  0, 'Member A does not see Story B'
);

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000b2');
select tests.select_org('bb120000-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from public.live_coaching_events
   where title like '%ORG_B_SECRET_MARKER%'),
  1, 'Member B sees Event B'
);
select is(
  (select count(*)::int from public.live_coaching_events
   where title like '%ORG_A_SECRET_MARKER%'),
  0, 'Member B does not see Event A'
);
select is(
  (select count(*)::int from public.ascend_stories where title = 'Story A'),
  0, 'Member B does not see Story A'
);

-- Cross-tenant UPDATE/DELETE no-op
select tests.authenticate_as('aa120000-0000-0000-0000-0000000000a1');
select tests.select_org('bb120000-0000-0000-0000-000000000001');
select lives_ok(
  $$ update public.live_coaching_events
     set title = 'hijacked'
     where id = 'ee120000-0000-0000-0000-000000000032' $$,
  'OrgA UPDATE Event B is RLS no-op'
);
select lives_ok(
  $$ delete from public.ascend_stories
     where id = 'ee120000-0000-0000-0000-000000000052' $$,
  'OrgA DELETE Story B is RLS no-op'
);

reset role;
select is(
  (select title from public.live_coaching_events
   where id = 'ee120000-0000-0000-0000-000000000032'),
  'Event B ORG_B_SECRET_MARKER',
  'Event B unchanged after OrgA UPDATE attempt'
);
select ok(
  exists (select 1 from public.ascend_stories
          where id = 'ee120000-0000-0000-0000-000000000052'),
  'Story B still exists after OrgA DELETE attempt'
);

-- ============================================================
-- 6) Tools / CRM / plans
-- ============================================================

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000a1');
select tests.select_org('bb120000-0000-0000-0000-000000000001');
select is(
  (select url from public.external_tools where key = 'onboarding'),
  'https://org-a-tool.test',
  'Org A tools → Tool A URL only'
);
select is(
  (select count(*)::int from public.external_tools
   where url = 'https://isolation-tool.test'),
  0, 'Org A does not see Tool B'
);
select is(
  (select count(*)::int from public.contacts where name = 'Contact B'),
  0, 'Org A does not see Contact B'
);
select is(
  (select count(*)::int from public.pipeline_events
   where id = 'ee120000-0000-0000-0000-000000000082'),
  0, 'Org A does not see pipeline B'
);
select is(
  (select count(*)::int from public.daily_plans
   where id = 'ee120000-0000-0000-0000-000000000092'),
  0, 'Org A does not see daily_plan B'
);

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000b1');
select tests.select_org('bb120000-0000-0000-0000-000000000002');
select is(
  (select url from public.external_tools where key = 'onboarding'),
  'https://isolation-tool.test',
  'Org B tools → Tool B URL only (no WayToMoon fallback)'
);
select is(
  (select count(*)::int from public.external_tools
   where url ilike '%waytomoon%'),
  0, 'Org B has no WayToMoon tool URL'
);
select is(
  (select count(*)::int from public.contacts where name = 'Contact A'),
  0, 'Org B does not see Contact A'
);

-- Manipulated organization_id INSERT denied
select throws_ok(
  $$ insert into public.external_tools
       (org_id, key, name, url, share_event_type)
     values ('bb120000-0000-0000-0000-000000000001',
             'evil', 'Evil', 'https://evil.test', 'presentation_sent') $$,
  '42501',
  null,
  'Org B cannot INSERT tool with organization_id = A'
);

-- ============================================================
-- 7) Content + Instagram + Autopilot + AP
-- ============================================================

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000a1');
select tests.select_org('bb120000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.content_assets where title = 'Asset A'),
  1, 'Org A sees Asset A'
);
select is(
  (select count(*)::int from public.content_assets where title = 'Asset B'),
  0, 'Org A does not see Asset B'
);
select is(
  (select count(*)::int from public.content_instagram_connections
   where ig_username = 'ig_b_test'),
  0, 'Org A does not see IG connection B'
);
select is(
  (select count(*)::int from public.content_facebook_business_connections
   where id = 'ee120000-0000-0000-0000-0000000000fc'),
  0, 'Org A does not see FB connection B'
);
select is(
  (select count(*)::int from public.content_autopilot_settings
   where id = 'ee120000-0000-0000-0000-0000000000s2'),
  0, 'Org A does not see Autopilot settings B'
);
select is(
  (select cardinality(carousel_asset_ids)::int
   from public.content_autopilot_slots
   where id = 'ee120000-0000-0000-0000-0000000000l1'),
  0, 'Org A Autopilot slot has empty carousel_asset_ids (1 image)'
);

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000b1');
select tests.select_org('bb120000-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from public.content_assets where title = 'Asset B'),
  1, 'Org B sees Asset B'
);
select is(
  (select count(*)::int from public.content_assets where title = 'Asset A'),
  0, 'Org B does not see Asset A'
);
select is(
  (select count(*)::int from public.content_instagram_connections
   where ig_username = 'ig_a_test'),
  0, 'Org B does not see IG connection A'
);
select is(
  (select cardinality(carousel_asset_ids)::int
   from public.content_autopilot_slots
   where id = 'ee120000-0000-0000-0000-0000000000l2'),
  0, 'Org B Autopilot slot has empty carousel_asset_ids (1 image)'
);
select is(
  (select count(*)::int from public.ap_task_defs where key = 'p12_a'),
  0, 'Org B does not see AP task A'
);
select is(
  (select count(*)::int from public.ap_task_defs where key = 'p12_b'),
  1, 'Org B sees AP task B'
);

-- Storage path tenant prefix (owner bypass for cross-check)
reset role;
select ok(
  (select storage_path like 'bb120000-0000-0000-0000-000000000001/%'
   from public.content_assets where title = 'Asset A'),
  'Asset A storage_path prefixed with Org A id'
);
select ok(
  (select storage_path like 'bb120000-0000-0000-0000-000000000002/%'
   from public.content_assets where title = 'Asset B'),
  'Asset B storage_path prefixed with Org B id'
);

-- ============================================================
-- 8) Billing + usage isolation
-- ============================================================

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000a1');
select tests.select_org('bb120000-0000-0000-0000-000000000001');
select lives_ok($$select public.org_admin_get_billing()$$,
  'Org Admin A → billing A');
select is(
  (public.org_admin_get_billing()->>'organization_id')::uuid,
  'bb120000-0000-0000-0000-000000000001'::uuid,
  'Billing A scoped to Org A'
);
select is(
  (select count(*)::int from public.org_billing_accounts
   where organization_id = 'bb120000-0000-0000-0000-000000000002'),
  0, 'Org Admin A cannot see Billing B rows'
);
select is(
  (select count(*)::int from public.org_subscriptions
   where organization_id = 'bb120000-0000-0000-0000-000000000002'),
  0, 'Org Admin A cannot see subscription B'
);

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000b1');
select tests.select_org('bb120000-0000-0000-0000-000000000002');
select lives_ok($$select public.org_admin_get_billing()$$,
  'Org Admin B → billing B');
select is(
  (select count(*)::int from public.org_billing_accounts
   where organization_id = 'bb120000-0000-0000-0000-000000000001'),
  0, 'Org Admin B cannot see Billing A rows'
);

-- Seat counts separate (platform admin may read both orgs)
select tests.authenticate_as('aa120000-0000-0000-0000-0000000000p1');
select is(
  public.billing_count_active_seats('bb120000-0000-0000-0000-000000000001')
    <> public.billing_count_active_seats('bb120000-0000-0000-0000-000000000002'),
  true,
  'Seat counts for A and B are independently computed'
);

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000a1');
select tests.select_org('bb120000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.usage_events
   where metadata->>'marker' = 'ORG_B_SECRET_MARKER'),
  0, 'Org A usage does not expose B marker'
);

-- ============================================================
-- 9) Admin isolation + platform break-glass
-- ============================================================

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000a1');
select tests.select_org('bb120000-0000-0000-0000-000000000001');
select is(public.is_organization_admin(), true, 'Org Admin A is org admin');
select is(public.is_platform_super_admin(), false, 'Org Admin A is NOT platform admin');

select tests.select_org('bb120000-0000-0000-0000-000000000002');
select is(public.is_organization_admin(), false,
  'Org Admin A + forged B header → not org admin of B');

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000b1');
select tests.select_org('bb120000-0000-0000-0000-000000000002');
select is(public.is_organization_admin(), true, 'Org Admin B is org admin');
select is(public.is_platform_super_admin(), false, 'Org Admin B is NOT platform admin');

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000a2');
select tests.select_org('bb120000-0000-0000-0000-000000000001');
select is(public.is_platform_super_admin(), false, 'Member is NOT platform admin');
select is(public.is_organization_admin(), false, 'Member is NOT org admin');

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000p1');
select is(public.is_platform_super_admin(), true, 'Platform Admin recognized');
select ok(
  (select count(*)::int from public.platform_list_organizations()) >= 2,
  'Platform Admin can list A and B'
);
select ok(
  (select count(*)::int from public.platform_list_billing(null)) >= 2,
  'Platform Admin can see A + B billing'
);

-- Org Admin cannot call platform create
select tests.authenticate_as('aa120000-0000-0000-0000-0000000000a1');
select tests.select_org('bb120000-0000-0000-0000-000000000001');
select throws_ok(
  $$ select public.platform_create_organization(
       'Should Fail Org', 'Should Fail Org', null, null, null, null) $$,
  '42501',
  null,
  'Org Admin cannot open platform_create_organization'
);

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$ select public.platform_create_organization(
       'Should Fail Org 2', 'Should Fail Org 2', null, null, null, null) $$,
  '42501',
  null,
  'Member cannot open platform_create_organization'
);

-- Platform create Org B-style fixture stays free of Seyda defaults (test-only)
select tests.authenticate_as('aa120000-0000-0000-0000-0000000000p1');
select lives_ok(
  $$ select public.platform_create_organization(
       'AscendOS Isolation Test Org CI',
       'Isolation Test Org CI',
       'https://isolation-ci.test',
       null,
       'https://isolation-ci.test/logo.png',
       null) $$,
  'Platform Admin can create isolation-style org in CI'
);

select ok(
  exists (
    select 1 from public.organizations
    where name = 'AscendOS Isolation Test Org CI'
      and branding->>'display_name' = 'Isolation Test Org CI'
      and branding::text not ilike '%waytomoon%'
      and branding::text not ilike '%team%seyda%'
  ),
  'platform_create_organization seeds neutral branding (no Seyda defaults)'
);

-- ============================================================
-- 10) Teams / memberships / organizations visibility
-- ============================================================

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000a1');
select tests.select_org('bb120000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.teams
   where id = 'cc120000-0000-0000-0000-000000000002'),
  0, 'Org A does not see Team B'
);
select is(
  (select count(*)::int from public.memberships
   where id = 'dd120000-0000-0000-0000-0000000000b1'),
  0, 'Org A does not see Membership B admin row'
);

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000b1');
select tests.select_org('bb120000-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from public.teams
   where id = 'cc120000-0000-0000-0000-000000000001'),
  0, 'Org B does not see Team A'
);

-- ============================================================
-- 11) SECURITY DEFINER: ensure_org_billing rejects foreign org
-- ============================================================

select tests.authenticate_as('aa120000-0000-0000-0000-0000000000a1');
select tests.select_org('bb120000-0000-0000-0000-000000000001');
select throws_ok(
  $$ select public.ensure_org_billing('bb120000-0000-0000-0000-000000000002') $$,
  '42501',
  null,
  'Org Admin A cannot ensure_org_billing for Org B (SECURITY DEFINER gate)'
);

select * from finish();
rollback;
