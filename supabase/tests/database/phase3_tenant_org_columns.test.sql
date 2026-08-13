-- ============================================================
-- Phase 3: tenant org columns + Org #1 integrity (pgTAP)
-- Migration: 20260831000044_phase3_tenant_org_columns.sql
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

-- ---------- Fixtures ----------
set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('d7000000-0000-0000-0000-00000000000a', 'p3-anna@test.local');
set local session_replication_role = origin;

insert into public.profiles
  (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  (
    'd7000000-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011',
    null,
    'super_admin',
    'P3Anna',
    'A',
    'p3anna'
  );

set local session_replication_role = replica;
insert into public.memberships (identity_id, org_id, team_id, role, status)
values
  (
    'd7000000-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011',
    'super_admin',
    'active'
  );
set local session_replication_role = origin;

-- A/E Org #1 present; helpers untouched
select ok(
  exists (
    select 1 from public.organizations
    where id = '00000000-0000-0000-0000-000000000001'
  ),
  'Org #1 (Chogan / Team Seyda seed) remains present'
);

select ok(
  to_regprocedure('public.current_org_id()') is not null
  and to_regprocedure('public.active_membership_id()') is not null
  and to_regprocedure('public.is_platform_super_admin()') is not null
  and to_regprocedure('public.is_organization_admin()') is not null,
  'org/platform helpers remain present (Phase 3 must not alter them)'
);

-- Schema: org_id NOT NULL + FK on the four tenant tables
select ok(
  (
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'coach_knowledge_articles'
      and column_name = 'org_id'
  ),
  'coach_knowledge_articles.org_id is NOT NULL'
);

select ok(
  (
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'live_coaching_events'
      and column_name = 'org_id'
  ),
  'live_coaching_events.org_id is NOT NULL'
);

select ok(
  (
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'coaching_notification_outbox'
      and column_name = 'org_id'
  ),
  'coaching_notification_outbox.org_id is NOT NULL'
);

select ok(
  (
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ascend_stories'
      and column_name = 'org_id'
  ),
  'ascend_stories.org_id is NOT NULL'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'coach_knowledge_articles_org_id_fkey'
  )
  and exists (
    select 1 from pg_constraint
    where conname = 'live_coaching_events_org_id_fkey'
  )
  and exists (
    select 1 from pg_constraint
    where conname = 'coaching_notification_outbox_org_id_fkey'
  )
  and exists (
    select 1 from pg_constraint
    where conname = 'ascend_stories_org_id_fkey'
  ),
  'org_id foreign keys to organizations exist'
);

-- Versions / change_log deliberately have no org_id (FK chain via article)
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'coach_knowledge_versions'
      and column_name = 'org_id'
  )
  and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'coach_knowledge_change_log'
      and column_name = 'org_id'
  ),
  'versions/change_log have no duplicate org_id (derive via article_id)'
);

-- A/E existing + new knowledge rows → Org #1 (no nulls)
select is(
  (
    select count(*)::int
    from public.coach_knowledge_articles
    where org_id is null
       or org_id is distinct from '00000000-0000-0000-0000-000000000001'
  ),
  0,
  'all coach_knowledge_articles rows belong to Org #1 (no nulls)'
);

insert into public.coach_knowledge_articles
  (id, title, slug, body_markdown, category, status, created_by)
values
  (
    'a7000000-0000-0000-0000-000000000001',
    'P3 Knowledge Title',
    'p3-knowledge-title',
    'body unchanged marker',
    'Allgemein',
    'draft',
    'd7000000-0000-0000-0000-00000000000a'
  );

select is(
  (
    select org_id from public.coach_knowledge_articles
    where id = 'a7000000-0000-0000-0000-000000000001'
  ),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'new knowledge article defaults to Org #1'
);

select is(
  (
    select title from public.coach_knowledge_articles
    where id = 'a7000000-0000-0000-0000-000000000001'
  ),
  'P3 Knowledge Title',
  'knowledge article content preserved (title unchanged)'
);

-- G/H versions + change_log follow article org via article_id
insert into public.coach_knowledge_versions
  (id, article_id, version, title, body_markdown, category, status)
values
  (
    'b7000000-0000-0000-0000-000000000001',
    'a7000000-0000-0000-0000-000000000001',
    1,
    'P3 Knowledge Title',
    'body unchanged marker',
    'Allgemein',
    'draft'
  );

insert into public.coach_knowledge_change_log
  (id, article_id, version, action, detail, actor_id)
values
  (
    'c7000000-0000-0000-0000-000000000001',
    'a7000000-0000-0000-0000-000000000001',
    1,
    'created',
    'p3 fixture',
    'd7000000-0000-0000-0000-00000000000a'
  );

select is(
  (
    select a.org_id
    from public.coach_knowledge_versions v
    join public.coach_knowledge_articles a on a.id = v.article_id
    where v.id = 'b7000000-0000-0000-0000-000000000001'
  ),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'knowledge version belongs to article Org #1'
);

select is(
  (
    select a.org_id
    from public.coach_knowledge_change_log c
    join public.coach_knowledge_articles a on a.id = c.article_id
    where c.id = 'c7000000-0000-0000-0000-000000000001'
  ),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'knowledge change_log belongs to article Org #1'
);

-- B/E live coaching → Org #1
select is(
  (
    select count(*)::int
    from public.live_coaching_events
    where org_id is null
       or org_id is distinct from '00000000-0000-0000-0000-000000000001'
  ),
  0,
  'all live_coaching_events rows belong to Org #1 (no nulls)'
);

insert into public.live_coaching_events
  (id, title, starts_at, media_type, media_path, media_url, created_by)
values
  (
    'e7000000-0000-0000-0000-000000000001',
    'P3 Live Event',
    now() + interval '2 days',
    'image',
    'p3/flyer.jpg',
    'https://example.test/p3-flyer.jpg',
    'd7000000-0000-0000-0000-00000000000a'
  );

select is(
  (
    select org_id from public.live_coaching_events
    where id = 'e7000000-0000-0000-0000-000000000001'
  ),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'new live coaching event defaults to Org #1'
);

select is(
  (
    select title from public.live_coaching_events
    where id = 'e7000000-0000-0000-0000-000000000001'
  ),
  'P3 Live Event',
  'live coaching event content preserved'
);

-- C/I outbox → Org #1 and matches event
select is(
  (
    select count(*)::int
    from public.coaching_notification_outbox
    where org_id is null
       or org_id is distinct from '00000000-0000-0000-0000-000000000001'
  ),
  0,
  'all coaching_notification_outbox rows belong to Org #1 (no nulls)'
);

insert into public.coaching_notification_outbox
  (id, event_id, kind, scheduled_for, title, body)
values
  (
    'f7000000-0000-0000-0000-000000000001',
    'e7000000-0000-0000-0000-000000000001',
    't_minus_30',
    now() + interval '1 day',
    'P3 reminder',
    'starts soon'
  );

select is(
  (
    select o.org_id
    from public.coaching_notification_outbox o
    join public.live_coaching_events e on e.id = o.event_id
    where o.id = 'f7000000-0000-0000-0000-000000000001'
      and o.org_id = e.org_id
  ),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'outbox.org_id matches parent event.org_id (Org #1)'
);

-- kind t_minus_30 preserved (compatibility; not renamed in Phase 3)
select is(
  (
    select kind from public.coaching_notification_outbox
    where id = 'f7000000-0000-0000-0000-000000000001'
  ),
  't_minus_30',
  'outbox kind t_minus_30 unchanged'
);

-- D/E stories → Org #1
select is(
  (
    select count(*)::int
    from public.ascend_stories
    where org_id is null
       or org_id is distinct from '00000000-0000-0000-0000-000000000001'
  ),
  0,
  'all ascend_stories rows belong to Org #1 (no nulls)'
);

insert into public.ascend_stories
  (id, story_type, title, body, published_at, expires_at, created_by)
values
  (
    '77000000-0000-0000-0000-000000000001',
    'achievements',
    'P3 Story',
    'story body marker',
    now(),
    now() + interval '1 day',
    'd7000000-0000-0000-0000-00000000000a'
  );

select is(
  (
    select org_id from public.ascend_stories
    where id = '77000000-0000-0000-0000-000000000001'
  ),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'new story defaults to Org #1'
);

select is(
  (
    select body from public.ascend_stories
    where id = '77000000-0000-0000-0000-000000000001'
  ),
  'story body marker',
  'story content preserved'
);

-- F invalid org_id rejected
select throws_ok(
  $$ insert into public.ascend_stories
       (story_type, title, body, published_at, expires_at, org_id)
     values (
       'achievements', 'bad', 'x', now(), now() + interval '1 day',
       '99999999-9999-9999-9999-999999999999'
     ) $$,
  '23503',
  null,
  'invalid org_id foreign key is rejected'
);

-- J IDs stable after content-only update
update public.coach_knowledge_articles
set category = 'Allgemein'
where id = 'a7000000-0000-0000-0000-000000000001';

select ok(
  exists (
    select 1 from public.coach_knowledge_articles
    where id = 'a7000000-0000-0000-0000-000000000001'
      and slug = 'p3-knowledge-title'
      and body_markdown = 'body unchanged marker'
  )
  and exists (
    select 1 from public.live_coaching_events
    where id = 'e7000000-0000-0000-0000-000000000001'
  )
  and exists (
    select 1 from public.coaching_notification_outbox
    where id = 'f7000000-0000-0000-0000-000000000001'
  )
  and exists (
    select 1 from public.ascend_stories
    where id = '77000000-0000-0000-0000-000000000001'
  ),
  'fixture IDs and content remain (no delete / no id rewrite)'
);

-- L no destructive wipe of Org #1 seed
select ok(
  exists (
    select 1 from public.organizations
    where id = '00000000-0000-0000-0000-000000000001'
  )
  and exists (
    select 1 from public.teams
    where id = '00000000-0000-0000-0000-000000000011'
  ),
  'Org #1 and Team Seyda seed not deleted'
);

-- Per-org slug uniqueness constraint present
select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'coach_knowledge_articles_org_slug_key'
  ),
  'knowledge slug uniqueness is per org_id'
);

-- RLS policy names still present (Phase 3 must not rewrite RLS matrix)
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coach_knowledge_articles'
      and policyname = 'coach_knowledge_articles_select'
  )
  and exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'live_coaching_events'
      and policyname = 'live_coaching_events_select'
  )
  and exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ascend_stories'
      and policyname = 'ascend_stories_select'
  )
  and exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coaching_notification_outbox'
      and policyname = 'coaching_notification_outbox_select'
  ),
  'existing RLS policy names remain (Phase 4 owns tenant RLS)'
);

select * from finish();
rollback;
