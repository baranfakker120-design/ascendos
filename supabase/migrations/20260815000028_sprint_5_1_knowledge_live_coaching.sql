-- Sprint 5.1 — Coach Knowledge Center + Live Coaching Center (additive only).
-- Does not alter genealogy, AP, rewards, rankings, permissions RPCs, or existing knowledge_docs.

-- ---------------------------------------------------------------------------
-- Helpers (new): SuperAdmin OR Developer may manage coach content
-- ---------------------------------------------------------------------------
create or replace function public.is_coach_content_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- memberships.role is the only authority (same pattern as is_super_admin).
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
grant execute on function public.is_coach_content_manager() to authenticated;

-- ---------------------------------------------------------------------------
-- Knowledge Center articles (separate from knowledge_docs RAG ingest)
-- ---------------------------------------------------------------------------
create table if not exists public.coach_knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
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
    check (not active or status = 'approved')
);

create index if not exists coach_knowledge_articles_status_idx
  on public.coach_knowledge_articles (status, active);
create index if not exists coach_knowledge_articles_category_idx
  on public.coach_knowledge_articles (category);
create index if not exists coach_knowledge_articles_tags_gin
  on public.coach_knowledge_articles using gin (tags);
create index if not exists coach_knowledge_articles_search_idx
  on public.coach_knowledge_articles
  using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body_markdown, '')));

drop trigger if exists coach_knowledge_articles_set_updated_at on public.coach_knowledge_articles;
create trigger coach_knowledge_articles_set_updated_at
before update on public.coach_knowledge_articles
for each row execute function public.set_updated_at();

create table if not exists public.coach_knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.coach_knowledge_articles(id) on delete cascade,
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

create table if not exists public.coach_knowledge_change_log (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.coach_knowledge_articles(id) on delete cascade,
  version int,
  action text not null,
  detail text,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists coach_knowledge_change_log_article_idx
  on public.coach_knowledge_change_log (article_id, created_at desc);

alter table public.coach_knowledge_articles enable row level security;
alter table public.coach_knowledge_versions enable row level security;
alter table public.coach_knowledge_change_log enable row level security;

drop policy if exists "coach_knowledge_articles_select" on public.coach_knowledge_articles;
create policy "coach_knowledge_articles_select"
on public.coach_knowledge_articles for select to authenticated
using (
  public.is_coach_content_manager()
  or (active = true and status = 'approved')
);

drop policy if exists "coach_knowledge_articles_write" on public.coach_knowledge_articles;
create policy "coach_knowledge_articles_write"
on public.coach_knowledge_articles for all to authenticated
using (public.is_coach_content_manager())
with check (public.is_coach_content_manager());

drop policy if exists "coach_knowledge_versions_select" on public.coach_knowledge_versions;
create policy "coach_knowledge_versions_select"
on public.coach_knowledge_versions for select to authenticated
using (
  public.is_coach_content_manager()
  or exists (
    select 1 from public.coach_knowledge_articles a
    where a.id = article_id and a.active = true and a.status = 'approved'
  )
);

drop policy if exists "coach_knowledge_versions_write" on public.coach_knowledge_versions;
create policy "coach_knowledge_versions_write"
on public.coach_knowledge_versions for all to authenticated
using (public.is_coach_content_manager())
with check (public.is_coach_content_manager());

drop policy if exists "coach_knowledge_change_log_select" on public.coach_knowledge_change_log;
create policy "coach_knowledge_change_log_select"
on public.coach_knowledge_change_log for select to authenticated
using (public.is_coach_content_manager());

drop policy if exists "coach_knowledge_change_log_write" on public.coach_knowledge_change_log;
create policy "coach_knowledge_change_log_write"
on public.coach_knowledge_change_log for all to authenticated
using (public.is_coach_content_manager())
with check (public.is_coach_content_manager());

-- ---------------------------------------------------------------------------
-- Live Coaching events
-- ---------------------------------------------------------------------------
create table if not exists public.live_coaching_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  description text,
  coach_name text not null default 'Coach',
  category text not null default 'Live Coaching',
  language text not null default 'de',
  starts_at timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes > 0 and duration_minutes <= 480),
  zoom_url text,
  repeat_rule text not null default 'none'
    check (repeat_rule in ('none', 'daily', 'weekly', 'biweekly', 'monthly')),
  media_type text not null check (media_type in ('image', 'video')),
  media_path text,
  media_url text,
  active boolean not null default false,
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  -- Future-ready additive columns (unused until later sprints)
  replay_url text,
  recording_url text,
  guest_speakers jsonb not null default '[]'::jsonb,
  library_visible boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_coaching_events_active_starts_idx
  on public.live_coaching_events (active, starts_at);
create index if not exists live_coaching_events_category_idx
  on public.live_coaching_events (category);

drop trigger if exists live_coaching_events_set_updated_at on public.live_coaching_events;
create trigger live_coaching_events_set_updated_at
before update on public.live_coaching_events
for each row execute function public.set_updated_at();

alter table public.live_coaching_events enable row level security;

drop policy if exists "live_coaching_events_select" on public.live_coaching_events;
create policy "live_coaching_events_select"
on public.live_coaching_events for select to authenticated
using (
  public.is_coach_content_manager()
  or active = true
);

drop policy if exists "live_coaching_events_write" on public.live_coaching_events;
create policy "live_coaching_events_write"
on public.live_coaching_events for all to authenticated
using (public.is_coach_content_manager())
with check (public.is_coach_content_manager());

-- ---------------------------------------------------------------------------
-- Push notification subscriptions + outbox (Web Push / local scheduling)
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own"
on public.push_subscriptions for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.coaching_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.live_coaching_events(id) on delete cascade,
  kind text not null check (kind in ('published', 't_minus_30', 't_minus_5')),
  scheduled_for timestamptz not null,
  title text not null,
  body text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, kind)
);

create index if not exists coaching_notification_outbox_due_idx
  on public.coaching_notification_outbox (scheduled_for)
  where sent_at is null;

alter table public.coaching_notification_outbox enable row level security;

drop policy if exists "coaching_notification_outbox_select" on public.coaching_notification_outbox;
create policy "coaching_notification_outbox_select"
on public.coaching_notification_outbox for select to authenticated
using (true);

drop policy if exists "coaching_notification_outbox_write" on public.coaching_notification_outbox;
create policy "coaching_notification_outbox_write"
on public.coaching_notification_outbox for all to authenticated
using (public.is_coach_content_manager())
with check (public.is_coach_content_manager());

-- ---------------------------------------------------------------------------
-- Storage bucket for coaching media (9:16 image / short mp4)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coaching-media',
  'coaching-media',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "coaching_media_public_read" on storage.objects;
create policy "coaching_media_public_read"
on storage.objects for select
using (bucket_id = 'coaching-media');

drop policy if exists "coaching_media_manager_insert" on storage.objects;
create policy "coaching_media_manager_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'coaching-media'
  and public.is_coach_content_manager()
);

drop policy if exists "coaching_media_manager_update" on storage.objects;
create policy "coaching_media_manager_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'coaching-media'
  and public.is_coach_content_manager()
)
with check (
  bucket_id = 'coaching-media'
  and public.is_coach_content_manager()
);

drop policy if exists "coaching_media_manager_delete" on storage.objects;
create policy "coaching_media_manager_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'coaching-media'
  and public.is_coach_content_manager()
);
