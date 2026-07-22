-- ============================================================
-- Migration 6 (Sprint 4): KI-Coach
-- Agenten als Datensätze (ADR-011), Wissensbasis mit pgvector
-- (ADR-009/010), Konversationen, Wissenslücken-Log.
-- ============================================================

create extension if not exists vector with schema extensions;

-- ---------- Agenten: Konfiguration statt Code (ADR-011) ----------

create table public.agents (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  key            text not null,
  name           text not null,
  system_prompt  text not null,
  -- Retrieval-Filter: nur Wissens-Kategorien dieses Spezialisten.
  retrieval_categories text[] not null default '{}',
  model          text not null default 'claude-sonnet-4-6',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (org_id, key)
);

alter table public.agents enable row level security;

create policy agents_select_member on public.agents
  for select using (org_id = public.current_org_id() and is_active);

create policy agents_admin_all on public.agents
  for all using (public.is_super_admin() and org_id = public.current_org_id());

-- ---------- Wissensbasis (ADR-009 / ADR-010) ----------

create table public.knowledge_docs (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  team_id           uuid references public.teams(id) on delete cascade,
  title             text not null,
  category          text not null,
  language          text not null default 'de',
  version           int not null default 1,
  author_id         uuid references public.profiles(id) on delete set null,
  status            text not null default 'draft'
                    check (status in ('draft', 'approved', 'archived')),
  source_type       text not null default 'document'
                    check (source_type in ('document', 'transcript', 'faq',
                                           'guideline', 'best_practice')),
  valid_from        timestamptz not null default now(),
  valid_until       timestamptz,
  tags              text[] not null default '{}',
  supersedes_doc_id uuid references public.knowledge_docs(id) on delete set null,
  created_at        timestamptz not null default now()
);

create table public.knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  doc_id      uuid not null references public.knowledge_docs(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  chunk_index int not null,
  content     text not null,
  embedding   extensions.vector(1536), -- OpenAI text-embedding-3-small
  created_at  timestamptz not null default now()
);

create index knowledge_chunks_doc_idx on public.knowledge_chunks (doc_id);
create index knowledge_chunks_embedding_idx on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.knowledge_docs   enable row level security;
alter table public.knowledge_chunks enable row level security;

-- Freigegebenes, gültiges Wissen der eigenen Org (Team-Wissen nur fürs
-- eigene Team). Drafts sieht nur der Admin (ADR-010: approval-gated).
create policy knowledge_docs_select_approved on public.knowledge_docs
  for select using (
    org_id = public.current_org_id()
    and (
      (status = 'approved'
        and (valid_until is null or valid_until > now())
        and (team_id is null
             or team_id = (select team_id from public.profiles where id = auth.uid())))
      or public.is_super_admin()
    )
  );

create policy knowledge_docs_admin_write on public.knowledge_docs
  for all using (public.is_super_admin() and org_id = public.current_org_id());

create policy knowledge_chunks_select on public.knowledge_chunks
  for select using (
    exists (select 1 from public.knowledge_docs d where d.id = doc_id)
    -- Sichtbarkeit erbt vollständig von der Doc-Policy oben.
  );

create policy knowledge_chunks_admin_write on public.knowledge_chunks
  for all using (public.is_super_admin() and org_id = public.current_org_id());

-- Semantische Suche: läuft als Invoker -> RLS der Chunks/Docs greift.
create or replace function public.match_knowledge(
  query_embedding extensions.vector(1536),
  match_categories text[] default null,
  match_count int default 5,
  min_similarity float default 0.25
)
returns table (doc_id uuid, doc_title text, category text, content text, similarity float)
language sql
stable
as $$
  select
    d.id,
    d.title,
    d.category,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_docs d on d.id = c.doc_id
  where c.embedding is not null
    and (match_categories is null or d.category = any(match_categories))
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------- Wissenslücken: nachfragegetriebene Erfassung ----------

create table public.knowledge_gaps (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  agent_key  text not null,
  question   text not null,
  created_at timestamptz not null default now()
);

alter table public.knowledge_gaps enable row level security;

create policy knowledge_gaps_insert_own on public.knowledge_gaps
  for insert with check (user_id = auth.uid() and org_id = public.current_org_id());

create policy knowledge_gaps_admin_select on public.knowledge_gaps
  for select using (public.is_super_admin() and org_id = public.current_org_id());

-- ---------- Konversationen ----------

create table public.coach_convos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  agent_key  text,
  created_at timestamptz not null default now()
);

create table public.coach_messages (
  id         uuid primary key default gen_random_uuid(),
  convo_id   uuid not null references public.coach_convos(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

create index coach_convos_user_idx on public.coach_convos (user_id, created_at desc);
create index coach_messages_convo_idx on public.coach_messages (convo_id, created_at);

alter table public.coach_convos   enable row level security;
alter table public.coach_messages enable row level security;

create policy coach_convos_own on public.coach_convos
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and org_id = public.current_org_id());

create policy coach_messages_own on public.coach_messages
  for all
  using (exists (select 1 from public.coach_convos c
                 where c.id = convo_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.coach_convos c
                      where c.id = convo_id and c.user_id = auth.uid()));

-- Kostenkontrolle (ADR-007): Tageslimit pro Nutzer aus den
-- Org-Einstellungen; die Edge Function prüft vor jedem LLM-Aufruf.
create or replace function public.coach_messages_today(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.coach_messages m
  join public.coach_convos c on c.id = m.convo_id
  where c.user_id = p_user
    and m.role = 'user'
    and m.created_at >= date_trunc('day', now());
$$;
