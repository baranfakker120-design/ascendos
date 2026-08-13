-- ============================================================
-- Phase 4: RLS tenant isolation (pgTAP)
-- Migration: 20260901000045_phase4_rls_tenant_isolation.sql
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(46);

-- ---------- Fixtures ----------
set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('d8000000-0000-0000-0000-00000000000a', 'p4-usera@test.local'),
  ('d8000000-0000-0000-0000-00000000000b', 'p4-userb@test.local'),
  ('d8000000-0000-0000-0000-00000000000c', 'p4-membera@test.local'),
  ('d8000000-0000-0000-0000-00000000000d', 'p4-multi@test.local');
set local session_replication_role = origin;

insert into public.organizations (id, name) values
  ('a8000000-0000-0000-0000-000000000001', 'P4 OrgA'),
  ('a8000000-0000-0000-0000-000000000002', 'P4 OrgB');

insert into public.teams (id, org_id, name) values
  ('b8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 'P4 TeamA'),
  ('b8000000-0000-0000-0000-000000000002', 'a8000000-0000-0000-0000-000000000002', 'P4 TeamB');

insert into public.profiles
  (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('d8000000-0000-0000-0000-00000000000a', 'a8000000-0000-0000-0000-000000000001',
   'b8000000-0000-0000-0000-000000000001', null, 'super_admin', 'P4A', 'Mgr', 'p4amgr'),
  ('d8000000-0000-0000-0000-00000000000b', 'a8000000-0000-0000-0000-000000000002',
   'b8000000-0000-0000-0000-000000000002', null, 'super_admin', 'P4B', 'Mgr', 'p4bmgr'),
  ('d8000000-0000-0000-0000-00000000000c', 'a8000000-0000-0000-0000-000000000001',
   'b8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-00000000000a',
   'berater', 'P4A', 'Mem', 'p4amem'),
  ('d8000000-0000-0000-0000-00000000000d', 'a8000000-0000-0000-0000-000000000001',
   'b8000000-0000-0000-0000-000000000001', null, 'super_admin', 'P4AB', 'Multi', 'p4ab');

set local session_replication_role = replica;
insert into public.memberships (identity_id, org_id, team_id, role, status)
values
  ('d8000000-0000-0000-0000-00000000000a', 'a8000000-0000-0000-0000-000000000001',
   'b8000000-0000-0000-0000-000000000001', 'super_admin', 'active'),
  ('d8000000-0000-0000-0000-00000000000b', 'a8000000-0000-0000-0000-000000000002',
   'b8000000-0000-0000-0000-000000000002', 'super_admin', 'active'),
  ('d8000000-0000-0000-0000-00000000000c', 'a8000000-0000-0000-0000-000000000001',
   'b8000000-0000-0000-0000-000000000001', 'berater', 'active'),
  ('d8000000-0000-0000-0000-00000000000d', 'a8000000-0000-0000-0000-000000000001',
   'b8000000-0000-0000-0000-000000000001', 'super_admin', 'active'),
  ('d8000000-0000-0000-0000-00000000000d', 'a8000000-0000-0000-0000-000000000002',
   'b8000000-0000-0000-0000-000000000002', 'berater', 'active');
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

-- Seed tenant rows as table owner (bypass RLS)
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '', true);

insert into public.coach_knowledge_articles
  (id, org_id, title, slug, body_markdown, category, status, active, approved_at)
values
  ('e8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001',
   'SECRET_A', 'secret-a', 'SECRET_A body', 'Allgemein', 'approved', true, now()),
  ('e8000000-0000-0000-0000-000000000002', 'a8000000-0000-0000-0000-000000000002',
   'SECRET_B', 'secret-b', 'SECRET_B body', 'Allgemein', 'approved', true, now());

insert into public.coach_knowledge_versions
  (id, article_id, version, title, body_markdown, category, status)
values
  ('e8000000-0000-0000-0000-000000000011', 'e8000000-0000-0000-0000-000000000001',
   1, 'SECRET_A', 'SECRET_A body', 'Allgemein', 'approved'),
  ('e8000000-0000-0000-0000-000000000012', 'e8000000-0000-0000-0000-000000000002',
   1, 'SECRET_B', 'SECRET_B body', 'Allgemein', 'approved');

insert into public.coach_knowledge_change_log
  (id, article_id, version, action, detail)
values
  ('e8000000-0000-0000-0000-000000000021', 'e8000000-0000-0000-0000-000000000001',
   1, 'approved', 'SECRET_A log'),
  ('e8000000-0000-0000-0000-000000000022', 'e8000000-0000-0000-0000-000000000002',
   1, 'approved', 'SECRET_B log');

insert into public.live_coaching_events
  (id, org_id, title, starts_at, media_type, media_path, media_url, active)
values
  ('e8000000-0000-0000-0000-000000000031', 'a8000000-0000-0000-0000-000000000001',
   'Event A', now() + interval '3 days', 'image', 'a/flyer.jpg', 'https://example.test/a.jpg', true),
  ('e8000000-0000-0000-0000-000000000032', 'a8000000-0000-0000-0000-000000000002',
   'Event B', now() + interval '3 days', 'image', 'b/flyer.jpg', 'https://example.test/b.jpg', true);

insert into public.coaching_notification_outbox
  (id, org_id, event_id, kind, scheduled_for, title, body)
values
  ('e8000000-0000-0000-0000-000000000041', 'a8000000-0000-0000-0000-000000000001',
   'e8000000-0000-0000-0000-000000000031', 't_minus_30', now() + interval '2 days',
   'Outbox A', 'body a'),
  ('e8000000-0000-0000-0000-000000000042', 'a8000000-0000-0000-0000-000000000002',
   'e8000000-0000-0000-0000-000000000032', 't_minus_30', now() + interval '2 days',
   'Outbox B', 'body b');

insert into public.ascend_stories
  (id, org_id, story_type, title, body, published_at, expires_at, active)
values
  ('e8000000-0000-0000-0000-000000000051', 'a8000000-0000-0000-0000-000000000001',
   'achievements', 'Story A', 'story-a-body', now(), now() + interval '1 day', true),
  ('e8000000-0000-0000-0000-000000000052', 'a8000000-0000-0000-0000-000000000002',
   'achievements', 'Story B', 'story-b-body', now(), now() + interval '1 day', true);

-- Helpers unchanged / separation
select ok(
  public.is_platform_super_admin() is not null
  and to_regprocedure('public.is_organization_admin()') is not null
  and to_regprocedure('public.is_super_admin()') is not null
  and to_regprocedure('public.current_org_id()') is not null
  and to_regprocedure('public.active_membership_id()') is not null,
  'Phase 2/3 helpers remain present'
);

select ok(
  exists (
    select 1 from public.organizations
    where id = '00000000-0000-0000-0000-000000000001'
  ),
  'Org #1 seed preserved (data preservation)'
);

-- ========== Knowledge cross-org SELECT ==========
select tests.authenticate_as('d8000000-0000-0000-0000-00000000000a');
select tests.select_org('a8000000-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.coach_knowledge_articles where title = 'SECRET_A'),
  1,
  'OrgA manager SELECT SECRET_A → allow'
);
select is(
  (select count(*)::int from public.coach_knowledge_articles where title = 'SECRET_B'),
  0,
  'OrgA manager SELECT SECRET_B → deny'
);

select tests.authenticate_as('d8000000-0000-0000-0000-00000000000b');
select tests.select_org('a8000000-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from public.coach_knowledge_articles where title = 'SECRET_B'),
  1,
  'OrgB manager SELECT SECRET_B → allow'
);
select is(
  (select count(*)::int from public.coach_knowledge_articles where title = 'SECRET_A'),
  0,
  'OrgB manager SELECT SECRET_A → deny'
);

-- Member A can read approved A, not B
select tests.authenticate_as('d8000000-0000-0000-0000-00000000000c');
select tests.select_org('a8000000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.coach_knowledge_articles where title = 'SECRET_A'),
  1,
  'OrgA member SELECT approved SECRET_A → allow'
);
select is(
  (select count(*)::int from public.coach_knowledge_articles where title = 'SECRET_B'),
  0,
  'OrgA member SELECT SECRET_B → deny'
);

-- Versions / change_log isolation
select tests.authenticate_as('d8000000-0000-0000-0000-00000000000a');
select tests.select_org('a8000000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.coach_knowledge_versions
   where id = 'e8000000-0000-0000-0000-000000000011'),
  1,
  'OrgA can read Version A'
);
select is(
  (select count(*)::int from public.coach_knowledge_versions
   where id = 'e8000000-0000-0000-0000-000000000012'),
  0,
  'OrgA cannot read Version B'
);
select is(
  (select count(*)::int from public.coach_knowledge_change_log
   where id = 'e8000000-0000-0000-0000-000000000021'),
  1,
  'OrgA manager can read change_log A'
);
select is(
  (select count(*)::int from public.coach_knowledge_change_log
   where id = 'e8000000-0000-0000-0000-000000000022'),
  0,
  'OrgA cannot read change_log B'
);

-- Version insert attached to foreign article denied
select throws_ok(
  $$ insert into public.coach_knowledge_versions
       (article_id, version, title, body_markdown, category, status)
     values ('e8000000-0000-0000-0000-000000000002', 2, 'x', 'x', 'Allgemein', 'draft') $$,
  '42501',
  null,
  'OrgA cannot insert Version on OrgB article'
);

-- ========== Live coaching ==========
select is(
  (select count(*)::int from public.live_coaching_events where title = 'Event A'),
  1,
  'OrgA SELECT Event A → allow'
);
select is(
  (select count(*)::int from public.live_coaching_events where title = 'Event B'),
  0,
  'OrgA SELECT Event B → deny'
);

-- Cross-tenant UPDATE matches 0 rows under RLS (no error); verify no mutation.
select lives_ok(
  $$ update public.live_coaching_events
     set title = 'hijacked'
     where id = 'e8000000-0000-0000-0000-000000000032' $$,
  'OrgA UPDATE Event B is a no-op under RLS'
);

select lives_ok(
  $$ delete from public.live_coaching_events
     where id = 'e8000000-0000-0000-0000-000000000032' $$,
  'OrgA DELETE Event B is a no-op under RLS'
);

reset role;
select is(
  (select title from public.live_coaching_events
   where id = 'e8000000-0000-0000-0000-000000000032'),
  'Event B',
  'Event B title preserved (no cross-tenant UPDATE/DELETE)'
);
select ok(
  exists (
    select 1 from public.live_coaching_events
    where id = 'e8000000-0000-0000-0000-000000000032'
  ),
  'Event B row still exists after OrgA delete attempt'
);

select tests.authenticate_as('d8000000-0000-0000-0000-00000000000a');
select tests.select_org('a8000000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.live_coaching_events
   where id = 'e8000000-0000-0000-0000-000000000032'),
  0,
  'OrgA still cannot see Event B'
);

-- ========== Stories ==========
select is(
  (select count(*)::int from public.ascend_stories where title = 'Story A'),
  1,
  'OrgA SELECT Story A → allow'
);
select is(
  (select count(*)::int from public.ascend_stories where title = 'Story B'),
  0,
  'OrgA SELECT Story B → deny'
);

select throws_ok(
  $$ insert into public.ascend_stories
       (org_id, story_type, title, body, published_at, expires_at)
     values (
       'a8000000-0000-0000-0000-000000000002',
       'achievements', 'Forged Story', 'x', now(), now() + interval '1 day'
     ) $$,
  '42501',
  null,
  'OrgA INSERT story with org_id=B → deny'
);

-- ========== Outbox ==========
select is(
  (select count(*)::int from public.coaching_notification_outbox
   where title = 'Outbox A'),
  1,
  'OrgA SELECT Outbox A → allow'
);
select is(
  (select count(*)::int from public.coaching_notification_outbox
   where title = 'Outbox B'),
  0,
  'OrgA SELECT Outbox B → deny'
);

select throws_ok(
  $$ insert into public.coaching_notification_outbox
       (event_id, kind, scheduled_for, title, body, org_id)
     values (
       'e8000000-0000-0000-0000-000000000032',
       't_minus_5', now() + interval '1 day', 'x', 'x',
       'a8000000-0000-0000-0000-000000000002'
     ) $$,
  '42501',
  null,
  'OrgA INSERT outbox for Event B → deny'
);

-- ========== Manipulated organization_id ==========
select throws_ok(
  $$ insert into public.coach_knowledge_articles
       (org_id, title, slug, body_markdown, category, status)
     values (
       'a8000000-0000-0000-0000-000000000002',
       'evil', 'evil-slug', 'x', 'Allgemein', 'draft'
     ) $$,
  '42501',
  null,
  'OrgA INSERT article with org_id=B → deny'
);

select lives_ok(
  $$ insert into public.coach_knowledge_articles
       (org_id, title, slug, body_markdown, category, status)
     values (
       'a8000000-0000-0000-0000-000000000001',
       'ok-a', 'ok-a-slug', 'x', 'Allgemein', 'draft'
     ) $$,
  'OrgA INSERT article with org_id=A → allow'
);

select throws_ok(
  $$ update public.coach_knowledge_articles
     set org_id = 'a8000000-0000-0000-0000-000000000002'
     where id = 'e8000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'OrgA cannot move article org_id A→B'
);

reset role;
select is(
  (select org_id from public.coach_knowledge_articles
   where id = 'e8000000-0000-0000-0000-000000000001'),
  'a8000000-0000-0000-0000-000000000001'::uuid,
  'SECRET_A org_id unchanged after move attempt'
);

-- ========== Forged header ==========
select tests.authenticate_as('d8000000-0000-0000-0000-00000000000a');
select tests.select_org('a8000000-0000-0000-0000-000000000002');
select is(public.current_org_id(), null::uuid,
  'OrgA user forged x-ascendos-org=B → current_org_id null');
select is(
  (select count(*)::int from public.coach_knowledge_articles),
  0,
  'forged header yields no knowledge rows'
);
select is(
  (select count(*)::int from public.live_coaching_events),
  0,
  'forged header yields no live coaching rows'
);

-- ========== Multi-org header ==========
select tests.authenticate_as('d8000000-0000-0000-0000-00000000000d');
select tests.select_org('a8000000-0000-0000-0000-000000000001');
select is(public.current_org_id(),
  'a8000000-0000-0000-0000-000000000001'::uuid,
  'multi-org user header=A → OrgA');
select is(
  (select count(*)::int from public.coach_knowledge_articles where title = 'SECRET_A'),
  1,
  'multi-org header=A sees SECRET_A'
);
select is(
  (select count(*)::int from public.coach_knowledge_articles where title = 'SECRET_B'),
  0,
  'multi-org header=A does not see SECRET_B'
);

select tests.select_org('a8000000-0000-0000-0000-000000000002');
select is(public.current_org_id(),
  'a8000000-0000-0000-0000-000000000002'::uuid,
  'multi-org user header=B → OrgB');
-- berater in B: can read approved SECRET_B, not write changelog
select is(
  (select count(*)::int from public.coach_knowledge_articles where title = 'SECRET_B'),
  1,
  'multi-org header=B sees SECRET_B'
);
select is(
  (select count(*)::int from public.coach_knowledge_articles where title = 'SECRET_A'),
  0,
  'multi-org header=B does not see SECRET_A'
);

select tests.clear_org_header();
select is(public.active_membership_id(), null::uuid,
  'multi-org without header → deny (Fall 4)');
select is(
  (select count(*)::int from public.ascend_stories),
  0,
  'multi-org without header sees no stories'
);

-- ========== Role separation ==========
select tests.authenticate_as('d8000000-0000-0000-0000-00000000000a');
select tests.select_org('a8000000-0000-0000-0000-000000000001');
select is(public.is_organization_admin(), true, 'OrgA super_admin is organization admin');
select is(public.is_platform_super_admin(), false, 'OrgA admin is NOT platform admin');
select is(public.is_super_admin(), true, 'OrgA super_admin keeps org-scoped is_super_admin');

select tests.authenticate_as('d8000000-0000-0000-0000-00000000000c');
select tests.select_org('a8000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ insert into public.ascend_stories
       (org_id, story_type, title, body, published_at, expires_at)
     values (
       'a8000000-0000-0000-0000-000000000001',
       'achievements', 'member-story', 'x', now(), now() + interval '1 day'
     ) $$,
  '42501',
  null,
  'ordinary member cannot write stories'
);

-- kind compatibility untouched
reset role;
select is(
  (select kind from public.coaching_notification_outbox
   where id = 'e8000000-0000-0000-0000-000000000041'),
  't_minus_30',
  'outbox kind t_minus_30 unchanged'
);

select * from finish();
rollback;
