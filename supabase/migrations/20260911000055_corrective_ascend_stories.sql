-- ============================================================
-- Corrective 55 (covers production gap from historical migration 29)
-- Ascend Stories — tenant-aware from day one
--
-- WHY NOT RE-RUN 20260816000029_sprint_5_2_ascend_stories.sql:
--   Original 29 creates stories WITHOUT org_id and with GLOBAL RLS
--   (any authenticated user could read all orgs' active stories).
--
-- THIS MIGRATION:
--   ascend_stories with org_id NOT NULL + FK + indexes + updated_at
--   Phase-4-style tenant RLS (no global stories policy)
--
-- Does NOT: seed Org#1 stories or touch live_coaching / CMS / storage.
-- ============================================================

create table if not exists public.ascend_stories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null
    references public.organizations (id) on delete restrict
    default coalesce(
      public.current_org_id(),
      '00000000-0000-0000-0000-000000000001'::uuid
    ),
  story_type text not null
    check (story_type in (
      'achievements',
      'onboarding',
      'presentations',
      'zoom',
      'qualifications',
      'customers',
      'partners',
      'coach_highlights',
      'admin'
    )),
  media_kind text not null default 'text'
    check (media_kind in ('text', 'image', 'video', 'voice')),
  title text not null,
  body text not null,
  author_label text not null default 'Ascend',
  subject_name text,
  subject_membership_id uuid,
  media_path text,
  media_url text,
  tone text not null default 'celebrate'
    check (tone in ('motivate', 'celebrate', 'inspire')),
  source text not null default 'admin'
    check (source in ('coach', 'admin', 'system')),
  active boolean not null default true,
  published_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ascend_stories_expires_after_publish
    check (expires_at > published_at)
);

-- Harden if an older table existed without org_id
alter table public.ascend_stories
  add column if not exists org_id uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ascend_stories'
      and column_name = 'org_id'
      and is_nullable = 'YES'
  ) and not exists (
    select 1 from public.ascend_stories where org_id is null
  ) then
    alter table public.ascend_stories
      alter column org_id set not null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ascend_stories_org_id_fkey'
  ) then
    alter table public.ascend_stories
      add constraint ascend_stories_org_id_fkey
      foreign key (org_id) references public.organizations (id)
      on delete restrict;
  end if;
end
$$;

alter table public.ascend_stories
  alter column org_id set default coalesce(
    public.current_org_id(),
    '00000000-0000-0000-0000-000000000001'::uuid
  );

create index if not exists ascend_stories_org_id_idx
  on public.ascend_stories (org_id);
create index if not exists ascend_stories_active_expires_idx
  on public.ascend_stories (active, expires_at desc);
create index if not exists ascend_stories_org_active_expires_idx
  on public.ascend_stories (org_id, active, expires_at desc);
create index if not exists ascend_stories_type_idx
  on public.ascend_stories (story_type);
create index if not exists ascend_stories_published_idx
  on public.ascend_stories (published_at desc);

drop trigger if exists ascend_stories_set_updated_at on public.ascend_stories;
create trigger ascend_stories_set_updated_at
before update on public.ascend_stories
for each row execute function public.set_updated_at();

alter table public.ascend_stories enable row level security;

-- Tenant-aware: no global stories policy
drop policy if exists "ascend_stories_select" on public.ascend_stories;
create policy "ascend_stories_select"
on public.ascend_stories for select to authenticated
using (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
  and (
    public.is_coach_content_manager()
    or (active = true and expires_at > now())
  )
);

drop policy if exists "ascend_stories_write" on public.ascend_stories;
create policy "ascend_stories_write"
on public.ascend_stories for all to authenticated
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
