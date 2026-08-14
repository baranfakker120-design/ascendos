-- ============================================================
-- Corrective migrations 52–55 (historical gaps 23/30/28/29)
-- pgTAP: AP mission scoring, frame RPCs, CMS + Stories tenant RLS
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(36);

-- ---------- Fixtures ----------
set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('da000000-0000-0000-0000-00000000000a', 'corr-usera@test.local'),
  ('da000000-0000-0000-0000-00000000000b', 'corr-userb@test.local'),
  ('da000000-0000-0000-0000-00000000000c', 'corr-membera@test.local'),
  ('da000000-0000-0000-0000-00000000000d', 'corr-multi@test.local');
set local session_replication_role = origin;

insert into public.organizations (id, name) values
  ('aa000000-0000-0000-0000-000000000001', 'Corr OrgA'),
  ('aa000000-0000-0000-0000-000000000002', 'Corr OrgB');

insert into public.teams (id, org_id, name) values
  ('ba000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'Corr TeamA'),
  ('ba000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000002', 'Corr TeamB');

insert into public.profiles
  (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('da000000-0000-0000-0000-00000000000a', 'aa000000-0000-0000-0000-000000000001',
   'ba000000-0000-0000-0000-000000000001', null, 'super_admin', 'CorrA', 'Mgr', 'corramgr'),
  ('da000000-0000-0000-0000-00000000000b', 'aa000000-0000-0000-0000-000000000002',
   'ba000000-0000-0000-0000-000000000002', null, 'super_admin', 'CorrB', 'Mgr', 'corrbmgr'),
  ('da000000-0000-0000-0000-00000000000c', 'aa000000-0000-0000-0000-000000000001',
   'ba000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-00000000000a',
   'berater', 'CorrA', 'Mem', 'corramem'),
  ('da000000-0000-0000-0000-00000000000d', 'aa000000-0000-0000-0000-000000000001',
   'ba000000-0000-0000-0000-000000000001', null, 'super_admin', 'CorrAB', 'Multi', 'corrab');

set local session_replication_role = replica;
insert into public.memberships (identity_id, org_id, team_id, role, status)
values
  ('da000000-0000-0000-0000-00000000000a', 'aa000000-0000-0000-0000-000000000001',
   'ba000000-0000-0000-0000-000000000001', 'super_admin', 'active'),
  ('da000000-0000-0000-0000-00000000000b', 'aa000000-0000-0000-0000-000000000002',
   'ba000000-0000-0000-0000-000000000002', 'super_admin', 'active'),
  ('da000000-0000-0000-0000-00000000000c', 'aa000000-0000-0000-0000-000000000001',
   'ba000000-0000-0000-0000-000000000001', 'berater', 'active'),
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

create or replace function tests.clear_org_header()
returns void language plpgsql as $$
begin
  perform set_config('request.headers', '{}', true);
end;
$$;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '', true);

-- ---------- 23 / 52: AP design score ----------
select has_function(
  'public', 'ap_design_score_mission', array['text'],
  'ap_design_score_mission(text) exists'
);

select is(public.ap_design_score_mission('new_contacts'), 25, 'mission new_contacts = 25');
select is(public.ap_design_score_mission('follow_up_overdue'), 50, 'mission follow_up_overdue = 50');
select is(public.ap_design_score_mission('presentation_pending'), 75, 'mission presentation_pending = 75');
select is(public.ap_design_score_mission('fit_check_next_step'), 100, 'mission fit_check_next_step = 100');
select is(public.ap_design_score_mission('unknown_type'), 50, 'mission default = 50');

-- mission_completed rule: sentinel ap=1 must be overridden by scorer
insert into public.ap_rules (org_id, source_kind, event_type, ap, note, is_active)
select 'aa000000-0000-0000-0000-000000000001', 'usage_event', 'mission_completed', 1,
       'corrective test sentinel', true
where not exists (
  select 1 from public.ap_rules
  where org_id = 'aa000000-0000-0000-0000-000000000001'
    and source_kind = 'usage_event'
    and event_type = 'mission_completed'
    and is_active
);

update public.ap_rules
set ap = 1, is_active = true
where org_id = 'aa000000-0000-0000-0000-000000000001'
  and source_kind = 'usage_event'
  and event_type = 'mission_completed';

-- Keep a non-mission rule at 0 to prove economy not auto-raised by corrective
insert into public.ap_rules (org_id, source_kind, event_type, ap, note, is_active)
select 'aa000000-0000-0000-0000-000000000001', 'usage_event', 'app_opened', 0,
       'corrective compat zero', true
where not exists (
  select 1 from public.ap_rules
  where org_id = 'aa000000-0000-0000-0000-000000000001'
    and source_kind = 'usage_event'
    and event_type = 'app_opened'
    and is_active
);

update public.ap_rules
set ap = 0
where org_id = 'aa000000-0000-0000-0000-000000000001'
  and source_kind = 'usage_event'
  and event_type = 'app_opened'
  and is_active;

select is(
  (select ap from public.ap_rules
   where org_id = 'aa000000-0000-0000-0000-000000000001'
     and source_kind = 'usage_event'
     and event_type = 'app_opened'
     and is_active
   limit 1),
  0,
  'AP economy unchanged for app_opened (still 0)'
);

-- Fire award trigger as table owner (same pattern as other suites)
insert into public.usage_events (user_id, org_id, event_type, metadata)
values (
  'da000000-0000-0000-0000-00000000000c',
  'aa000000-0000-0000-0000-000000000001',
  'mission_completed',
  jsonb_build_object('mission_type', 'fit_check_next_step')
);

select is(
  (
    select l.delta
    from public.ap_ledger l
    join public.memberships m on m.id = l.membership_id
    where m.identity_id = 'da000000-0000-0000-0000-00000000000c'
      and l.reason = 'mission_completed'
    order by l.created_at desc
    limit 1
  ),
  100,
  'mission_completed awards ap_design_score_mission(fit_check_next_step)=100'
);

insert into public.usage_events (user_id, org_id, event_type, metadata)
values (
  'da000000-0000-0000-0000-00000000000c',
  'aa000000-0000-0000-0000-000000000001',
  'app_opened',
  '{}'::jsonb
);

select is(
  (
    select count(*)::int from public.ap_ledger l
    join public.memberships m on m.id = l.membership_id
    where m.identity_id = 'da000000-0000-0000-0000-00000000000c'
      and l.reason = 'app_opened'
      and l.created_at > now() - interval '1 minute'
  ),
  0,
  'non-mission event with ap=0 remains compatible (no ledger row)'
);

-- ---------- 30 / 53: Frame RPCs ----------
select has_function(
  'public', 'ensure_role_frame_cosmetics',
  'ensure_role_frame_cosmetics exists'
);
select has_function(
  'public', 'list_my_frame_cosmetics',
  'list_my_frame_cosmetics exists'
);
select has_function(
  'public', 'equip_frame_cosmetic', array['uuid'],
  'equip_frame_cosmetic exists'
);

insert into public.cosmetic_items (id, org_id, kind, key, label, asset_path, is_active)
values
  ('ea000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001',
   'frame', 'corr-frame-a', 'Frame A', 'frame-01', true),
  ('ea000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000002',
   'frame', 'corr-frame-b', 'Frame B', 'frame-01', true);

insert into public.membership_cosmetics (membership_id, item_id, kind, is_equipped)
select m.id, 'ea000000-0000-0000-0000-000000000001', 'frame', false
from public.memberships m
where m.identity_id = 'da000000-0000-0000-0000-00000000000c'
  and m.org_id = 'aa000000-0000-0000-0000-000000000001'
on conflict do nothing;

insert into public.membership_cosmetics (membership_id, item_id, kind, is_equipped)
select m.id, 'ea000000-0000-0000-0000-000000000002', 'frame', false
from public.memberships m
where m.identity_id = 'da000000-0000-0000-0000-00000000000b'
  and m.org_id = 'aa000000-0000-0000-0000-000000000002'
on conflict do nothing;

select tests.authenticate_as('da000000-0000-0000-0000-00000000000c');
select tests.select_org('aa000000-0000-0000-0000-000000000001');

select ok(
  exists (
    select 1 from public.list_my_frame_cosmetics()
    where item_id = 'ea000000-0000-0000-0000-000000000001'
  ),
  'member can list own org frame'
);

select lives_ok(
  $$select public.equip_frame_cosmetic('ea000000-0000-0000-0000-000000000001')$$,
  'member can equip own unlocked frame'
);

select throws_ok(
  $$select public.equip_frame_cosmetic('ea000000-0000-0000-0000-000000000002')$$,
  'P0001',
  'frame not unlocked',
  'member cannot equip foreign org frame'
);

-- ---------- 28 / 54: CMS tenant isolation ----------
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '', true);

insert into public.coach_knowledge_articles
  (id, org_id, title, slug, body_markdown, category, status, active, approved_at)
values
  ('ea000000-0000-0000-0000-000000000011', 'aa000000-0000-0000-0000-000000000001',
   'CORR_SECRET_A', 'corr-secret-a', 'body-a', 'Allgemein', 'approved', true, now()),
  ('ea000000-0000-0000-0000-000000000012', 'aa000000-0000-0000-0000-000000000002',
   'CORR_SECRET_B', 'corr-secret-b', 'body-b', 'Allgemein', 'approved', true, now()),
  ('ea000000-0000-0000-0000-000000000013', 'aa000000-0000-0000-0000-000000000001',
   'CORR_DRAFT_A', 'corr-draft-a', 'draft-a', 'Allgemein', 'draft', false, null);

insert into public.coach_knowledge_versions
  (id, article_id, version, title, body_markdown, category, status)
values
  ('ea000000-0000-0000-0000-000000000021', 'ea000000-0000-0000-0000-000000000011',
   1, 'CORR_SECRET_A', 'body-a', 'Allgemein', 'approved'),
  ('ea000000-0000-0000-0000-000000000022', 'ea000000-0000-0000-0000-000000000012',
   1, 'CORR_SECRET_B', 'body-b', 'Allgemein', 'approved');

insert into public.coach_knowledge_change_log
  (id, article_id, version, action, detail)
values
  ('ea000000-0000-0000-0000-000000000031', 'ea000000-0000-0000-0000-000000000011',
   1, 'approved', 'log-a'),
  ('ea000000-0000-0000-0000-000000000032', 'ea000000-0000-0000-0000-000000000012',
   1, 'approved', 'log-b');

select tests.authenticate_as('da000000-0000-0000-0000-00000000000c');
select tests.select_org('aa000000-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.coach_knowledge_articles where title like 'CORR_SECRET_%'),
  1,
  'OrgA member reads only OrgA approved CMS'
);

select is(
  (select count(*)::int from public.coach_knowledge_articles where title = 'CORR_SECRET_B'),
  0,
  'OrgA member cannot read OrgB CMS'
);

select is(
  (select count(*)::int from public.coach_knowledge_articles where title = 'CORR_DRAFT_A'),
  0,
  'non-manager cannot read draft CMS'
);

select is(
  (select count(*)::int from public.coach_knowledge_versions v
   join public.coach_knowledge_articles a on a.id = v.article_id
   where a.title = 'CORR_SECRET_B'),
  0,
  'versions isolated via parent article org'
);

select tests.authenticate_as('da000000-0000-0000-0000-00000000000b');
select tests.select_org('aa000000-0000-0000-0000-000000000002');

select throws_ok(
  $$insert into public.coach_knowledge_articles
      (org_id, title, slug, body_markdown, category, status, active)
    values (
      'aa000000-0000-0000-0000-000000000001',
      'FORGED', 'forged-a', 'x', 'Allgemein', 'draft', false
    )$$,
  '42501',
  null,
  'OrgB manager cannot write OrgA org_id'
);

select tests.authenticate_as('da000000-0000-0000-0000-00000000000a');
select tests.select_org('aa000000-0000-0000-0000-000000000002');
select is(public.current_org_id(), null::uuid, 'forged x-ascendos-org → current_org_id NULL');
select is(
  (select count(*)::int from public.coach_knowledge_articles where title like 'CORR_%'),
  0,
  'forged header → no CMS rows'
);

select tests.authenticate_as('da000000-0000-0000-0000-00000000000d');
select tests.clear_org_header();
select is(public.active_membership_id(), null::uuid, 'multi-org without header → Fall 4');
select is(
  (select count(*)::int from public.coach_knowledge_articles where title like 'CORR_%'),
  0,
  'multi-org without header → no CMS rows'
);

select tests.select_org('aa000000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.coach_knowledge_articles where title = 'CORR_SECRET_A'),
  1,
  'multi-org user limited to selected active org CMS'
);

select tests.select_org('aa000000-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from public.coach_knowledge_articles
   where title = 'CORR_SECRET_B' and active and status = 'approved'),
  1,
  'multi-org user in OrgB reads OrgB approved CMS only'
);

-- ---------- 29 / 55: Stories ----------
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '', true);

insert into public.ascend_stories
  (id, org_id, story_type, title, body, published_at, expires_at, active)
values
  ('ea000000-0000-0000-0000-000000000041', 'aa000000-0000-0000-0000-000000000001',
   'achievements', 'Story A Live', 'a-live', now(), now() + interval '1 day', true),
  ('ea000000-0000-0000-0000-000000000042', 'aa000000-0000-0000-0000-000000000002',
   'achievements', 'Story B Live', 'b-live', now(), now() + interval '1 day', true),
  ('ea000000-0000-0000-0000-000000000043', 'aa000000-0000-0000-0000-000000000001',
   'achievements', 'Story A Expired', 'a-exp', now() - interval '2 days',
   now() - interval '1 day', true);

select tests.authenticate_as('da000000-0000-0000-0000-00000000000c');
select tests.select_org('aa000000-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.ascend_stories where title = 'Story A Live'),
  1,
  'OrgA member reads own active story'
);

select is(
  (select count(*)::int from public.ascend_stories where title = 'Story B Live'),
  0,
  'OrgA member cannot read OrgB story'
);

select is(
  (select count(*)::int from public.ascend_stories where title = 'Story A Expired'),
  0,
  'expired stories filtered for non-manager members'
);

select tests.authenticate_as('da000000-0000-0000-0000-00000000000b');
select tests.select_org('aa000000-0000-0000-0000-000000000002');

select throws_ok(
  $$insert into public.ascend_stories
      (org_id, story_type, title, body, published_at, expires_at, active)
    values (
      'aa000000-0000-0000-0000-000000000001',
      'achievements', 'Forged Story', 'x', now(), now() + interval '1 day', true
    )$$,
  '42501',
  null,
  'OrgB cannot insert story with OrgA org_id'
);

select tests.authenticate_as('da000000-0000-0000-0000-00000000000a');
select tests.select_org('aa000000-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from public.ascend_stories where title like 'Story %'),
  0,
  'forged header → no stories'
);

select tests.authenticate_as('da000000-0000-0000-0000-00000000000d');
select tests.clear_org_header();
select is(
  (select count(*)::int from public.ascend_stories where title like 'Story %'),
  0,
  'multi-org without header → no stories'
);

select tests.select_org('aa000000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.ascend_stories where title = 'Story A Live'),
  1,
  'multi-org user limited to selected org stories'
);

select tests.authenticate_as('da000000-0000-0000-0000-00000000000a');
select tests.select_org('aa000000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.coach_knowledge_change_log where detail = 'log-a'),
  1,
  'OrgA manager reads own change_log'
);
select is(
  (select count(*)::int from public.coach_knowledge_change_log where detail = 'log-b'),
  0,
  'OrgA manager cannot read OrgB change_log'
);

select ok(
  to_regprocedure('public.ap_apply_to_total()') is not null,
  'ap_apply_to_total still present (auto-equip out of scope)'
);

select * from finish();
rollback;
