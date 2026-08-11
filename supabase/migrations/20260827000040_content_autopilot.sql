-- ============================================================
-- Migration 40: Instagram Content Autopilot V1 (ADDITIVE ONLY)
--
-- Instagram-only. No Facebook tables/columns/functions.
-- Does NOT alter Coach, BottomNav, OAuth token crypto, or reel Graph helpers.
-- Reuses content_assets / content_drafts / content_publish_attempts.
-- ============================================================

-- ---------- Settings (one row per membership) ------------------------------
create table if not exists public.content_autopilot_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  enabled boolean not null default false,
  paused boolean not null default false,
  timezone text not null default 'Europe/Berlin',
  max_feed_per_day integer not null default 3
    check (max_feed_per_day >= 0 and max_feed_per_day <= 3),
  max_stories_per_day integer not null default 3
    check (max_stories_per_day >= 0 and max_stories_per_day <= 3),
  min_eligible_assets integer not null default 10
    check (min_eligible_assets >= 1 and min_eligible_assets <= 100),
  consent_confirmed_at timestamptz,
  last_activated_at timestamptz,
  last_paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_autopilot_settings_member unique (org_id, membership_id)
);

comment on table public.content_autopilot_settings is
  'Instagram Content Autopilot standing consent + limits per membership. No Facebook.';

-- ---------- Weekly / period plan ------------------------------------------
create table if not exists public.content_autopilot_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_autopilot_plans_range check (period_end >= period_start)
);

create index if not exists content_autopilot_plans_member_idx
  on public.content_autopilot_plans (org_id, membership_id, period_start desc);

comment on table public.content_autopilot_plans is
  'Autopilot planning windows (e.g. Mon–Sun). Additive Instagram-only layer.';

-- ---------- Planned slots -------------------------------------------------
create table if not exists public.content_autopilot_slots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  plan_id uuid not null references public.content_autopilot_plans (id) on delete cascade,
  draft_id uuid references public.content_drafts (id) on delete set null,
  asset_id uuid references public.content_assets (id) on delete set null,
  carousel_asset_ids uuid[] not null default '{}'::uuid[],
  planned_for timestamptz not null,
  slot_kind text not null check (slot_kind in ('feed', 'story')),
  content_format text not null check (content_format in ('story', 'feed', 'reel')),
  theme text,
  category text,
  selection_reason text,
  status text not null default 'planned'
    check (status in (
      'planned', 'ready', 'publishing', 'published', 'failed', 'skipped', 'cancelled'
    )),
  retry_count integer not null default 0 check (retry_count >= 0),
  max_retries integer not null default 3 check (max_retries >= 0 and max_retries <= 10),
  publish_attempt_id uuid references public.content_publish_attempts (id) on delete set null,
  error_message text,
  published_at timestamptz,
  performance_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_autopilot_slots_due_idx
  on public.content_autopilot_slots (status, planned_for)
  where status in ('planned', 'ready', 'failed');

create index if not exists content_autopilot_slots_plan_idx
  on public.content_autopilot_slots (plan_id, planned_for);

create index if not exists content_autopilot_slots_member_day_idx
  on public.content_autopilot_slots (membership_id, planned_for);

-- One active reservation per asset per membership (planned/ready/publishing).
create unique index if not exists content_autopilot_slots_asset_reserved_uidx
  on public.content_autopilot_slots (membership_id, asset_id)
  where asset_id is not null
    and status in ('planned', 'ready', 'publishing');

comment on table public.content_autopilot_slots is
  'Scheduled Instagram autopilot posts. Publishing via content-autopilot-run + existing Graph helpers.';

-- ---------- updated_at triggers -------------------------------------------
drop trigger if exists content_autopilot_settings_set_updated_at on public.content_autopilot_settings;
create trigger content_autopilot_settings_set_updated_at
  before update on public.content_autopilot_settings
  for each row execute function public.content_set_updated_at();

drop trigger if exists content_autopilot_plans_set_updated_at on public.content_autopilot_plans;
create trigger content_autopilot_plans_set_updated_at
  before update on public.content_autopilot_plans
  for each row execute function public.content_set_updated_at();

drop trigger if exists content_autopilot_slots_set_updated_at on public.content_autopilot_slots;
create trigger content_autopilot_slots_set_updated_at
  before update on public.content_autopilot_slots
  for each row execute function public.content_set_updated_at();

-- ---------- RLS -----------------------------------------------------------
alter table public.content_autopilot_settings enable row level security;
alter table public.content_autopilot_plans enable row level security;
alter table public.content_autopilot_slots enable row level security;

drop policy if exists content_autopilot_settings_own on public.content_autopilot_settings;
create policy content_autopilot_settings_own on public.content_autopilot_settings
  for all to authenticated
  using (
    org_id = public.current_org_id()
    and membership_id = public.active_membership_id()
  )
  with check (
    org_id = public.current_org_id()
    and membership_id = public.active_membership_id()
  );

drop policy if exists content_autopilot_plans_own on public.content_autopilot_plans;
create policy content_autopilot_plans_own on public.content_autopilot_plans
  for all to authenticated
  using (
    org_id = public.current_org_id()
    and membership_id = public.active_membership_id()
  )
  with check (
    org_id = public.current_org_id()
    and membership_id = public.active_membership_id()
  );

drop policy if exists content_autopilot_slots_own on public.content_autopilot_slots;
create policy content_autopilot_slots_own on public.content_autopilot_slots
  for all to authenticated
  using (
    org_id = public.current_org_id()
    and membership_id = public.active_membership_id()
  )
  with check (
    org_id = public.current_org_id()
    and membership_id = public.active_membership_id()
  );
