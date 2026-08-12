-- Forward migration: Live Coaching + Web Push production objects only.
--
-- Context:
--   Production is missing 20260815000028 (and other gap migrations 15–32),
--   but later content migrations (33–40) including Autopilot are applied.
--   Blindly replaying 000028 or the full gap is unsafe.
--
-- This migration is additive and scoped to objects required by:
--   - Live Coaching UX (#101)
--   - Web Push (#102)
--
-- Explicitly NOT included (from 000028 Knowledge Center):
--   coach_knowledge_articles / versions / media / related policies
--
-- Prerequisites already present on production (verified via migration list + API):
--   - public.set_updated_at()          (since 20260721000001)
--   - public.is_coach_content_manager() (via 20260820000033)
--   - public.profiles
--
-- Idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS / ON CONFLICT.
-- Does not ALTER existing Live Coaching / Autopilot / OAuth tables.

-- ---------------------------------------------------------------------------
-- Guard: refuse to run if required helpers are missing
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.set_updated_at()') is null then
    raise exception 'live_coaching_web_push_forward: public.set_updated_at() is missing';
  end if;
  if to_regprocedure('public.is_coach_content_manager()') is null then
    raise exception
      'live_coaching_web_push_forward: public.is_coach_content_manager() is missing';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'live_coaching_web_push_forward: public.profiles is missing';
  end if;
end
$$;

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
  duration_minutes int not null default 60
    check (duration_minutes > 0 and duration_minutes <= 480),
  zoom_url text,
  repeat_rule text not null default 'none'
    check (repeat_rule in ('none', 'daily', 'weekly', 'biweekly', 'monthly')),
  media_type text not null check (media_type in ('image', 'video')),
  media_path text,
  media_url text,
  active boolean not null default false,
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  -- Future-ready additive columns (unused until later sprints; match #101 types)
  replay_url text,
  recording_url text,
  guest_speakers jsonb not null default '[]'::jsonb,
  library_visible boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
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
-- Web Push subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
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

-- ---------------------------------------------------------------------------
-- Coaching notification outbox (T−45 stored as kind t_minus_30 + T−5)
-- ---------------------------------------------------------------------------
create table if not exists public.coaching_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.live_coaching_events (id) on delete cascade,
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

drop policy if exists "coaching_notification_outbox_select"
  on public.coaching_notification_outbox;
create policy "coaching_notification_outbox_select"
on public.coaching_notification_outbox for select to authenticated
using (true);

drop policy if exists "coaching_notification_outbox_write"
  on public.coaching_notification_outbox;
create policy "coaching_notification_outbox_write"
on public.coaching_notification_outbox for all to authenticated
using (public.is_coach_content_manager())
with check (public.is_coach_content_manager());

-- ---------------------------------------------------------------------------
-- Storage bucket for coaching flyer media (9:16 image / short mp4)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coaching-media',
  'coaching-media',
  true,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm'
  ]
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
