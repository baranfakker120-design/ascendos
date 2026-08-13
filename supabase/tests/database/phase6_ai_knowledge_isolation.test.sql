-- ============================================================
-- Phase 6: Knowledge + AI Isolation (pgTAP)
-- Migration: 20260902000046_phase6_ai_knowledge_isolation.sql
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

-- ---------- Fixtures ----------
set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('d9000000-0000-0000-0000-00000000000a', 'p6-usera@test.local'),
  ('d9000000-0000-0000-0000-00000000000b', 'p6-userb@test.local'),
  ('d9000000-0000-0000-0000-00000000000d', 'p6-multi@test.local');
set local session_replication_role = origin;

insert into public.organizations (id, name) values
  ('a9000000-0000-0000-0000-000000000001', 'P6 OrgA'),
  ('a9000000-0000-0000-0000-000000000002', 'P6 OrgB');

insert into public.teams (id, org_id, name) values
  ('b9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001', 'P6 TeamA'),
  ('b9000000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-000000000002', 'P6 TeamB');

insert into public.profiles
  (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('d9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-000000000001',
   'b9000000-0000-0000-0000-000000000001', null, 'super_admin', 'P6A', 'Mgr', 'p6amgr'),
  ('d9000000-0000-0000-0000-00000000000b', 'a9000000-0000-0000-0000-000000000002',
   'b9000000-0000-0000-0000-000000000002', null, 'super_admin', 'P6B', 'Mgr', 'p6bmgr'),
  ('d9000000-0000-0000-0000-00000000000d', 'a9000000-0000-0000-0000-000000000001',
   'b9000000-0000-0000-0000-000000000001', null, 'super_admin', 'P6AB', 'Multi', 'p6ab');

set local session_replication_role = replica;
insert into public.memberships (identity_id, org_id, team_id, role, status)
values
  ('d9000000-0000-0000-0000-00000000000a', 'a9000000-0000-0000-0000-000000000001',
   'b9000000-0000-0000-0000-000000000001', 'super_admin', 'active'),
  ('d9000000-0000-0000-0000-00000000000b', 'a9000000-0000-0000-0000-000000000002',
   'b9000000-0000-0000-0000-000000000002', 'super_admin', 'active'),
  ('d9000000-0000-0000-0000-00000000000d', 'a9000000-0000-0000-0000-000000000001',
   'b9000000-0000-0000-0000-000000000001', 'super_admin', 'active'),
  ('d9000000-0000-0000-0000-00000000000d', 'a9000000-0000-0000-0000-000000000002',
   'b9000000-0000-0000-0000-000000000002', 'berater', 'active');
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

-- Seed as owner (bypass RLS)
reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.headers', '', true);

insert into public.agents (id, org_id, key, name, system_prompt, retrieval_categories)
values
  ('e9000000-0000-0000-0000-0000000000a1', 'a9000000-0000-0000-0000-000000000001',
   'knowledge', 'Agent A', 'ORG_A_AGENT_PROMPT', array['faq']),
  ('e9000000-0000-0000-0000-0000000000b1', 'a9000000-0000-0000-0000-000000000002',
   'knowledge', 'Agent B', 'ORG_B_AGENT_PROMPT', array['faq']);

insert into public.knowledge_docs
  (id, org_id, title, category, status, source_type)
values
  ('e9000000-0000-0000-0000-0000000000d1', 'a9000000-0000-0000-0000-000000000001',
   'Doc A', 'faq', 'approved', 'document'),
  ('e9000000-0000-0000-0000-0000000000d2', 'a9000000-0000-0000-0000-000000000002',
   'Doc B', 'faq', 'approved', 'document');

-- Identical embeddings so similarity alone cannot choose the "right" org —
-- org filter must decide.
insert into public.knowledge_chunks (id, doc_id, org_id, chunk_index, content, embedding)
values
  ('e9000000-0000-0000-0000-0000000000c1', 'e9000000-0000-0000-0000-0000000000d1',
   'a9000000-0000-0000-0000-000000000001', 0,
   'ASCENDOS_ORG_A_SECRET_9F31',
   array_fill(0.1::real, array[1536])::extensions.vector(1536)),
  ('e9000000-0000-0000-0000-0000000000c2', 'e9000000-0000-0000-0000-0000000000d2',
   'a9000000-0000-0000-0000-000000000002', 0,
   'ASCENDOS_ORG_B_SECRET_7K82',
   array_fill(0.1::real, array[1536])::extensions.vector(1536));

insert into public.coach_convos (id, user_id, org_id, agent_key)
values
  ('e9000000-0000-0000-0000-0000000000v1', 'd9000000-0000-0000-0000-00000000000d',
   'a9000000-0000-0000-0000-000000000001', 'knowledge'),
  ('e9000000-0000-0000-0000-0000000000v2', 'd9000000-0000-0000-0000-00000000000d',
   'a9000000-0000-0000-0000-000000000002', 'knowledge');

insert into public.coach_messages (convo_id, role, content)
values
  ('e9000000-0000-0000-0000-0000000000v1', 'user', 'ORG_A_CONVERSATION_SECRET'),
  ('e9000000-0000-0000-0000-0000000000v2', 'user', 'ORG_B_CONVERSATION_SECRET');

insert into public.coach_knowledge_articles
  (id, org_id, title, slug, body_markdown, category, status, active, approved_at)
values
  ('e9000000-0000-0000-0000-0000000000m1', 'a9000000-0000-0000-0000-000000000001',
   'CMS A', 'cms-a', 'ASCENDOS_ORG_A_CMS_SECRET', 'Allgemein', 'approved', true, now()),
  ('e9000000-0000-0000-0000-0000000000m2', 'a9000000-0000-0000-0000-000000000002',
   'CMS B', 'cms-b', 'ASCENDOS_ORG_B_CMS_SECRET', 'Allgemein', 'approved', true, now());

insert into public.knowledge_gaps (org_id, user_id, agent_key, question)
values
  ('a9000000-0000-0000-0000-000000000001', 'd9000000-0000-0000-0000-00000000000a',
   'knowledge', 'gap-a-topic'),
  ('a9000000-0000-0000-0000-000000000002', 'd9000000-0000-0000-0000-00000000000b',
   'knowledge', 'gap-b-topic');

-- ============================================================
-- Agents
-- ============================================================

select tests.authenticate_as('d9000000-0000-0000-0000-00000000000d');
select tests.select_org('a9000000-0000-0000-0000-000000000001');

select is(
  (select system_prompt from public.agents where key = 'knowledge'),
  'ORG_A_AGENT_PROMPT',
  'AB header A → Agent A only'
);

select is(
  (select count(*)::int from public.agents where system_prompt = 'ORG_B_AGENT_PROMPT'),
  0,
  'AB header A → Agent B invisible'
);

select tests.select_org('a9000000-0000-0000-0000-000000000002');

select is(
  (select system_prompt from public.agents where key = 'knowledge'),
  'ORG_B_AGENT_PROMPT',
  'AB header B → Agent B only'
);

-- ============================================================
-- match_knowledge isolation (identical embeddings)
-- ============================================================

select tests.select_org('a9000000-0000-0000-0000-000000000001');

select is(
  (select content from public.match_knowledge(
     array_fill(0.1::real, array[1536])::extensions.vector(1536),
     'a9000000-0000-0000-0000-000000000001'::uuid,
     null, 5, 0.0) limit 1),
  'ASCENDOS_ORG_A_SECRET_9F31',
  'A match_knowledge returns A secret'
);

select is(
  (select count(*)::int from public.match_knowledge(
     array_fill(0.1::real, array[1536])::extensions.vector(1536),
     'a9000000-0000-0000-0000-000000000001'::uuid,
     null, 5, 0.0)
   where content like '%ASCENDOS_ORG_B_SECRET_7K82%'),
  0,
  'A match_knowledge never returns B secret'
);

select throws_like(
  $$ select * from public.match_knowledge(
       array_fill(0.1::real, array[1536])::extensions.vector(1536),
       'a9000000-0000-0000-0000-000000000002'::uuid,
       null, 5, 0.0) $$,
  '%fremdes Organisationswissen%',
  'A cannot pass p_org_id=B (even as org super_admin)'
);

select tests.select_org('a9000000-0000-0000-0000-000000000002');

select is(
  (select content from public.match_knowledge(
     array_fill(0.1::real, array[1536])::extensions.vector(1536),
     'a9000000-0000-0000-0000-000000000002'::uuid,
     null, 5, 0.0) limit 1),
  'ASCENDOS_ORG_B_SECRET_7K82',
  'B match_knowledge returns B secret'
);

select is(
  (select count(*)::int from public.match_knowledge(
     array_fill(0.1::real, array[1536])::extensions.vector(1536),
     'a9000000-0000-0000-0000-000000000002'::uuid,
     null, 5, 0.0)
   where content like '%ASCENDOS_ORG_A_SECRET_9F31%'),
  0,
  'B match_knowledge never returns A secret'
);

-- ============================================================
-- Knowledge docs / chunks RLS
-- ============================================================

select tests.select_org('a9000000-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.knowledge_docs where title = 'Doc A'),
  1,
  'A sees Doc A'
);

select is(
  (select count(*)::int from public.knowledge_docs where title = 'Doc B'),
  0,
  'A does not see Doc B'
);

select is(
  (select count(*)::int from public.knowledge_chunks
   where content like '%ASCENDOS_ORG_B_SECRET_7K82%'),
  0,
  'A does not see Chunk B'
);

-- ============================================================
-- Conversations / messages (the Phase-6 RLS fix)
-- ============================================================

select tests.select_org('a9000000-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.coach_convos
   where id = 'e9000000-0000-0000-0000-0000000000v1'),
  1,
  'AB header A → convo A visible'
);

select is(
  (select count(*)::int from public.coach_convos
   where id = 'e9000000-0000-0000-0000-0000000000v2'),
  0,
  'AB header A → convo B DENY'
);

select is(
  (select count(*)::int from public.coach_messages
   where content = 'ORG_A_CONVERSATION_SECRET'),
  1,
  'AB header A → message A visible'
);

select is(
  (select count(*)::int from public.coach_messages
   where content = 'ORG_B_CONVERSATION_SECRET'),
  0,
  'AB header A → message B DENY'
);

select tests.select_org('a9000000-0000-0000-0000-000000000002');

select is(
  (select count(*)::int from public.coach_convos
   where id = 'e9000000-0000-0000-0000-0000000000v2'),
  1,
  'AB header B → convo B visible'
);

select is(
  (select count(*)::int from public.coach_convos
   where id = 'e9000000-0000-0000-0000-0000000000v1'),
  0,
  'AB header B → convo A DENY'
);

select is(
  (select count(*)::int from public.coach_messages
   where content = 'ORG_B_CONVERSATION_SECRET'),
  1,
  'AB header B → message B visible'
);

select is(
  (select count(*)::int from public.coach_messages
   where content = 'ORG_A_CONVERSATION_SECRET'),
  0,
  'AB header B → message A DENY'
);

-- ============================================================
-- CMS articles (RLS — coach-chat does not load CMS into prompts)
-- ============================================================

select tests.select_org('a9000000-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.coach_knowledge_articles
   where body_markdown like '%ASCENDOS_ORG_A_CMS_SECRET%'),
  1,
  'A CMS secret visible under header A'
);

select is(
  (select count(*)::int from public.coach_knowledge_articles
   where body_markdown like '%ASCENDOS_ORG_B_CMS_SECRET%'),
  0,
  'B CMS secret invisible under header A'
);

select tests.select_org('a9000000-0000-0000-0000-000000000002');

select is(
  (select count(*)::int from public.coach_knowledge_articles
   where body_markdown like '%ASCENDOS_ORG_B_CMS_SECRET%'),
  1,
  'B CMS secret visible under header B'
);

select is(
  (select count(*)::int from public.coach_knowledge_articles
   where body_markdown like '%ASCENDOS_ORG_A_CMS_SECRET%'),
  0,
  'A CMS secret invisible under header B'
);

-- ============================================================
-- Knowledge gaps
-- ============================================================

select tests.authenticate_as('d9000000-0000-0000-0000-00000000000a');
select tests.select_org('a9000000-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.knowledge_gaps where question = 'gap-a-topic'),
  1,
  'Org A admin sees Org A gaps'
);

select is(
  (select count(*)::int from public.knowledge_gaps where question = 'gap-b-topic'),
  0,
  'Org A admin does not see Org B gaps'
);

-- ============================================================
-- Forged header / user A alone
-- ============================================================

select tests.authenticate_as('d9000000-0000-0000-0000-00000000000a');
select tests.select_org('a9000000-0000-0000-0000-000000000002');

select is(
  public.current_org_id(),
  null,
  'User A with forged Org B header → current_org_id NULL'
);

select throws_like(
  $$ select * from public.match_knowledge(
       array_fill(0.1::real, array[1536])::extensions.vector(1536),
       'a9000000-0000-0000-0000-000000000002'::uuid,
       null, 5, 0.0) $$,
  '%fremdes Organisationswissen%',
  'Forged header cannot retrieve Org B knowledge'
);

select * from finish();
rollback;
