-- ============================================================
-- Corrective 54 (covers production gap from historical migration 28 CMS)
-- Coach Knowledge CMS tables — tenant-aware from day one
--
-- WHY NOT RE-RUN 20260815000028_sprint_5_1_knowledge_live_coaching.sql:
--   Original 28 creates CMS WITHOUT org_id and with GLOBAL RLS, plus
--   live_coaching / push / storage side-effects already present on
--   production via later migrations (e.g. 41). Re-running would be unsafe.
--
-- THIS MIGRATION:
--   coach_knowledge_articles / versions / change_log
--   org_id NOT NULL + UNIQUE(org_id, slug)
--   Phase-4-style tenant RLS (no global approved reads)
--   is_coach_content_manager() (CREATE OR REPLACE; idempotent)
--
-- Does NOT: create live_coaching, push, storage buckets, or seed Org#1 CMS rows.
-- ============================================================

-- ---------------------------------------------------------------------------
-- Helper: SuperAdmin OR Developer may manage coach content (membership-scoped)
-- ---------------------------------------------------------------------------
create or replace function public.is_coach_content_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select m.role in ('super_admin', 'developer')
      from public.memberships m
      where m.id = public.active_membership_id()
    ),
    false
  );
$$;

revoke all on function public.is_coach_content_manager() from public;
grant execute on function public.is_coach_content_manager() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Articles (org-scoped)
-- ---------------------------------------------------------------------------
create table if not exists public.coach_knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null
    references public.organizations (id) on delete restrict
    default coalesce(
      public.current_org_id(),
      '00000000-0000-0000-0000-000000000001'::uuid
    ),
  title text not null,
  slug text not null,
  body_markdown text not null default '',
  body_html text not null default '',
  category text not null default 'Allgemein',
  tags text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'needs_review', 'approved', 'archived')),
  contradiction_flags jsonb not null default '[]'::jsonb,
  contradiction_summary text,
  active boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  current_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_knowledge_active_requires_approved
    check (not active or status = 'approved'),
  constraint coach_knowledge_articles_org_slug_key unique (org_id, slug)
);

-- Harden environments where an older table existed without org_id
alter table public.coach_knowledge_articles
  add column if not exists org_id uuid;

-- Do NOT backfill foreign/Org#1 CMS data here. Only set NOT NULL when safe.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'coach_knowledge_articles'
      and column_name = 'org_id'
      and is_nullable = 'YES'
  ) and not exists (
    select 1 from public.coach_knowledge_articles where org_id is null
  ) then
    alter table public.coach_knowledge_articles
      alter column org_id set not null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'coach_knowledge_articles_org_id_fkey'
  ) then
    alter table public.coach_knowledge_articles
      add constraint coach_knowledge_articles_org_id_fkey
      foreign key (org_id) references public.organizations (id)
      on delete restrict;
  end if;
end
$$;

alter table public.coach_knowledge_articles
  alter column org_id set default coalesce(
    public.current_org_id(),
    '00000000-0000-0000-0000-000000000001'::uuid
  );

-- Prefer per-org slug uniqueness (drop legacy global unique if present)
alter table public.coach_knowledge_articles
  drop constraint if exists coach_knowledge_articles_slug_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'coach_knowledge_articles_org_slug_key'
  ) then
    alter table public.coach_knowledge_articles
      add constraint coach_knowledge_articles_org_slug_key
      unique (org_id, slug);
  end if;
end
$$;

create index if not exists coach_knowledge_articles_org_id_idx
  on public.coach_knowledge_articles (org_id);
create index if not exists coach_knowledge_articles_status_idx
  on public.coach_knowledge_articles (status, active);
create index if not exists coach_knowledge_articles_category_idx
  on public.coach_knowledge_articles (category);
create index if not exists coach_knowledge_articles_tags_gin
  on public.coach_knowledge_articles using gin (tags);
create index if not exists coach_knowledge_articles_search_idx
  on public.coach_knowledge_articles
  using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body_markdown, '')));

drop trigger if exists coach_knowledge_articles_set_updated_at
  on public.coach_knowledge_articles;
create trigger coach_knowledge_articles_set_updated_at
before update on public.coach_knowledge_articles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Versions (org via article_id)
-- ---------------------------------------------------------------------------
create table if not exists public.coach_knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null
    references public.coach_knowledge_articles(id) on delete cascade,
  version int not null,
  title text not null,
  body_markdown text not null,
  body_html text not null default '',
  category text not null,
  tags text[] not null default '{}',
  status text not null,
  change_summary text,
  contradiction_flags jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (article_id, version)
);

create index if not exists coach_knowledge_versions_article_idx
  on public.coach_knowledge_versions (article_id, version desc);

-- ---------------------------------------------------------------------------
-- Change log (org via article_id)
-- ---------------------------------------------------------------------------
create table if not exists public.coach_knowledge_change_log (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null
    references public.coach_knowledge_articles(id) on delete cascade,
  version int,
  action text not null,
  detail text,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists coach_knowledge_change_log_article_idx
  on public.coach_knowledge_change_log (article_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS — tenant-aware (Phase 4 contract); no global CMS policies
-- ---------------------------------------------------------------------------
alter table public.coach_knowledge_articles enable row level security;
alter table public.coach_knowledge_versions enable row level security;
alter table public.coach_knowledge_change_log enable row level security;

drop policy if exists "coach_knowledge_articles_select" on public.coach_knowledge_articles;
create policy "coach_knowledge_articles_select"
on public.coach_knowledge_articles for select to authenticated
using (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
  and (
    public.is_coach_content_manager()
    or (active = true and status = 'approved')
  )
);

drop policy if exists "coach_knowledge_articles_write" on public.coach_knowledge_articles;
create policy "coach_knowledge_articles_write"
on public.coach_knowledge_articles for all to authenticated
using (
  public.is_coach_content_manager()
  and org_id = public.current_org_id()
  and public.active_membership_id() is not null
)
with check (
  public.is_coach_content_manager()
  and org_id = public.current_org_id()
  and public.active_membership_id() is not null
);

drop policy if exists "coach_knowledge_versions_select" on public.coach_knowledge_versions;
create policy "coach_knowledge_versions_select"
on public.coach_knowledge_versions for select to authenticated
using (
  public.active_membership_id() is not null
  and exists (
    select 1
    from public.coach_knowledge_articles a
    where a.id = article_id
      and a.org_id = public.current_org_id()
      and (
        public.is_coach_content_manager()
        or (a.active = true and a.status = 'approved')
      )
  )
);

drop policy if exists "coach_knowledge_versions_write" on public.coach_knowledge_versions;
create policy "coach_knowledge_versions_write"
on public.coach_knowledge_versions for all to authenticated
using (
  public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and exists (
    select 1
    from public.coach_knowledge_articles a
    where a.id = article_id
      and a.org_id = public.current_org_id()
  )
)
with check (
  public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and exists (
    select 1
    from public.coach_knowledge_articles a
    where a.id = article_id
      and a.org_id = public.current_org_id()
  )
);

drop policy if exists "coach_knowledge_change_log_select" on public.coach_knowledge_change_log;
create policy "coach_knowledge_change_log_select"
on public.coach_knowledge_change_log for select to authenticated
using (
  public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and exists (
    select 1
    from public.coach_knowledge_articles a
    where a.id = article_id
      and a.org_id = public.current_org_id()
  )
);

drop policy if exists "coach_knowledge_change_log_write" on public.coach_knowledge_change_log;
create policy "coach_knowledge_change_log_write"
on public.coach_knowledge_change_log for all to authenticated
using (
  public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and exists (
    select 1
    from public.coach_knowledge_articles a
    where a.id = article_id
      and a.org_id = public.current_org_id()
  )
)
with check (
  public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and exists (
    select 1
    from public.coach_knowledge_articles a
    where a.id = article_id
      and a.org_id = public.current_org_id()
  )
);
