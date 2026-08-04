-- Sprint 5.2 — Ascend Stories (additive only).
-- Does not alter genealogy, AP, rewards, rankings, permissions RPCs, or Sprint 5.1 tables.

create table if not exists public.ascend_stories (
  id uuid primary key default gen_random_uuid(),
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
  -- Future-ready media kinds (text is default for Sprint 5.2)
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

create index if not exists ascend_stories_active_expires_idx
  on public.ascend_stories (active, expires_at desc);
create index if not exists ascend_stories_type_idx
  on public.ascend_stories (story_type);
create index if not exists ascend_stories_published_idx
  on public.ascend_stories (published_at desc);

drop trigger if exists ascend_stories_set_updated_at on public.ascend_stories;
create trigger ascend_stories_set_updated_at
before update on public.ascend_stories
for each row execute function public.set_updated_at();

alter table public.ascend_stories enable row level security;

-- Everyone authenticated may read active, non-expired stories.
drop policy if exists "ascend_stories_select" on public.ascend_stories;
create policy "ascend_stories_select"
on public.ascend_stories for select to authenticated
using (
  public.is_coach_content_manager()
  or (active = true and expires_at > now())
);

-- SuperAdmin / Developer may publish & manage.
drop policy if exists "ascend_stories_write" on public.ascend_stories;
create policy "ascend_stories_write"
on public.ascend_stories for all to authenticated
using (public.is_coach_content_manager())
with check (public.is_coach_content_manager());
