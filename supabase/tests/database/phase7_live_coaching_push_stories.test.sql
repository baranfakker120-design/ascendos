-- ============================================================
-- Phase 7: Live Coaching + Push + Stories + Storage (pgTAP)
-- Migration: 20260903000047_phase7_coaching_media_private.sql
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

-- ---------- Fixtures ----------
set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('da000000-0000-0000-0000-00000000000a', 'p7-usera@test.local'),
  ('da000000-0000-0000-0000-00000000000b', 'p7-userb@test.local'),
  ('da000000-0000-0000-0000-00000000000d', 'p7-multi@test.local');
set local session_replication_role = origin;

insert into public.organizations (id, name) values
  ('aa000000-0000-0000-0000-000000000001', 'P7 OrgA'),
  ('aa000000-0000-0000-0000-000000000002', 'P7 OrgB');

insert into public.teams (id, org_id, name) values
  ('ba000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'P7 TeamA'),
  ('ba000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000002', 'P7 TeamB');

insert into public.profiles
  (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('da000000-0000-0000-0000-00000000000a', 'aa000000-0000-0000-0000-000000000001',
   'ba000000-0000-0000-0000-000000000001', null, 'super_admin', 'P7A', 'Mgr', 'p7amgr'),
  ('da000000-0000-0000-0000-00000000000b', 'aa000000-0000-0000-0000-000000000002',
   'ba000000-0000-0000-0000-000000000002', null, 'super_admin', 'P7B', 'Mgr', 'p7bmgr'),
  ('da000000-0000-0000-0000-00000000000d', 'aa000000-0000-0000-0000-000000000001',
   'ba000000-0000-0000-0000-000000000001', null, 'super_admin', 'P7AB', 'Multi', 'p7ab');

set local session_replication_role = replica;
insert into public.memberships (identity_id, org_id, team_id, role, status)
values
  ('da000000-0000-0000-0000-00000000000a', 'aa000000-0000-0000-0000-000000000001',
   'ba000000-0000-0000-0000-000000000001', 'super_admin', 'active'),
  ('da000000-0000-0000-0000-00000000000b', 'aa000000-0000-0000-0000-000000000002',
   'ba000000-0000-0000-0000-000000000002', 'super_admin', 'active'),
  ('da000000-0000-0000-0000-00000000000d', 'aa000000-0000-0000-0000-000000000001',
   'ba000000-0000-0000-0000-000000000001', 'super_admin', 'active'),
  ('da000000-0000-0000-0000-00000000000d', 'aa000000-0000-0000-0000-000000000002',
   'ba000000-0000-0000-0000-000000000002', 'berater', 'active');
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

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '', true);

insert into public.live_coaching_events
  (id, org_id, title, starts_at, media_type, media_path, media_url, active)
values
  ('ea000000-0000-0000-0000-000000000031', 'aa000000-0000-0000-0000-000000000001',
   'LIVE_A_SECRET', now() + interval '3 days', 'image',
   'aa000000-0000-0000-0000-000000000001/flyer-a.jpg', null, true),
  ('ea000000-0000-0000-0000-000000000032', 'aa000000-0000-0000-0000-000000000002',
   'LIVE_B_SECRET', now() + interval '3 days', 'image',
   'aa000000-0000-0000-0000-000000000002/flyer-b.jpg', null, true);

insert into public.coaching_notification_outbox
  (id, org_id, event_id, kind, scheduled_for, title, body)
values
  ('ea000000-0000-0000-0000-000000000041', 'aa000000-0000-0000-0000-000000000001',
   'ea000000-0000-0000-0000-000000000031', 't_minus_30', now() + interval '2 days',
   'OUTBOX_A_SECRET', 'body a'),
  ('ea000000-0000-0000-0000-000000000042', 'aa000000-0000-0000-0000-000000000002',
   'ea000000-0000-0000-0000-000000000032', 't_minus_30', now() + interval '2 days',
   'OUTBOX_B_SECRET', 'body b');

insert into public.ascend_stories
  (id, org_id, story_type, title, body, published_at, expires_at, active)
values
  ('ea000000-0000-0000-0000-000000000051', 'aa000000-0000-0000-0000-000000000001',
   'achievements', 'STORY_A_SECRET', 'story-a', now(), now() + interval '1 day', true),
  ('ea000000-0000-0000-0000-000000000052', 'aa000000-0000-0000-0000-000000000002',
   'achievements', 'STORY_B_SECRET', 'story-b', now(), now() + interval '1 day', true);

-- ============================================================
-- Storage bucket privacy
-- ============================================================

select is(
  (select public from storage.buckets where id = 'coaching-media'),
  false,
  'coaching-media bucket is private'
);

select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'coaching_media_public_read'
  ),
  'public read policy removed'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'coaching_media_org_select'
  ),
  'org select policy present'
);

-- ============================================================
-- Live events
-- ============================================================

select tests.authenticate_as('da000000-0000-0000-0000-00000000000d');
select tests.select_org('aa000000-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.live_coaching_events where title = 'LIVE_A_SECRET'),
  1,
  'AB header A → LIVE_A_SECRET visible'
);

select is(
  (select count(*)::int from public.live_coaching_events where title = 'LIVE_B_SECRET'),
  0,
  'AB header A → LIVE_B_SECRET DENY'
);

select tests.select_org('aa000000-0000-0000-0000-000000000002');

select is(
  (select count(*)::int from public.live_coaching_events where title = 'LIVE_B_SECRET'),
  1,
  'AB header B → LIVE_B_SECRET visible'
);

select is(
  (select count(*)::int from public.live_coaching_events where title = 'LIVE_A_SECRET'),
  0,
  'AB header B → LIVE_A_SECRET DENY'
);

-- Forged create Event B while in Org A
select tests.select_org('aa000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ insert into public.live_coaching_events
       (org_id, title, starts_at, media_type, media_path, active)
     values (
       'aa000000-0000-0000-0000-000000000002',
       'FORGED_B', now() + interval '1 day', 'image', 'x.jpg', true
     ) $$,
  '42501',
  null,
  'AB header A cannot INSERT Event with org_id=B'
);

-- ============================================================
-- Outbox
-- ============================================================

select is(
  (select count(*)::int from public.coaching_notification_outbox
   where title = 'OUTBOX_A_SECRET'),
  1,
  'AB header A → OUTBOX_A visible'
);

select is(
  (select count(*)::int from public.coaching_notification_outbox
   where title = 'OUTBOX_B_SECRET'),
  0,
  'AB header A → OUTBOX_B DENY'
);

select is(
  (select o.org_id = e.org_id
   from public.coaching_notification_outbox o
   join public.live_coaching_events e on e.id = o.event_id
   where o.title = 'OUTBOX_A_SECRET'),
  true,
  'Outbox A org matches Event A org'
);

-- Cross-org outbox attach denied
select throws_ok(
  $$ insert into public.coaching_notification_outbox
       (event_id, kind, scheduled_for, title, body, org_id)
     values (
       'ea000000-0000-0000-0000-000000000032',
       'published', now(), 'bad', 'bad',
       'aa000000-0000-0000-0000-000000000001'
     ) $$,
  '42501',
  null,
  'Cannot attach OrgA outbox to OrgB event'
);

-- ============================================================
-- Stories
-- ============================================================

select is(
  (select count(*)::int from public.ascend_stories where title = 'STORY_A_SECRET'),
  1,
  'AB header A → STORY_A visible'
);

select is(
  (select count(*)::int from public.ascend_stories where title = 'STORY_B_SECRET'),
  0,
  'AB header A → STORY_B DENY'
);

select tests.select_org('aa000000-0000-0000-0000-000000000002');

select is(
  (select count(*)::int from public.ascend_stories where title = 'STORY_B_SECRET'),
  1,
  'AB header B → STORY_B visible'
);

select is(
  (select count(*)::int from public.ascend_stories where title = 'STORY_A_SECRET'),
  0,
  'AB header B → STORY_A DENY'
);

-- ============================================================
-- Timing kind preserved + forged header
-- ============================================================

reset role;
select is(
  (select kind from public.coaching_notification_outbox
   where id = 'ea000000-0000-0000-0000-000000000041'),
  't_minus_30',
  'Outbox kind t_minus_30 unchanged'
);

select tests.authenticate_as('da000000-0000-0000-0000-00000000000a');
select tests.select_org('aa000000-0000-0000-0000-000000000002');

select is(
  public.current_org_id(),
  null,
  'User A forged Org B header → current_org_id NULL'
);

select is(
  (select count(*)::int from public.live_coaching_events),
  0,
  'Forged header → no live events'
);

select is(
  (select count(*)::int from public.ascend_stories),
  0,
  'Forged header → no stories'
);

-- Multi-org no header → deny
select tests.authenticate_as('da000000-0000-0000-0000-00000000000d');
select set_config('request.headers', '{}', true);

select is(
  public.current_org_id(),
  null,
  'Multi-org no header → current_org_id NULL'
);

select is(
  (select count(*)::int from public.live_coaching_events),
  0,
  'Multi-org no header → no live events'
);

select * from finish();
rollback;
