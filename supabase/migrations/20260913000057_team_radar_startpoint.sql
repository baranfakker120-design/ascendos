-- ============================================================
-- Team Seyda Radar — per-user startpoint (additive only)
--
-- Stores radar_started_at once per (org, user). Never backfills
-- Instagram history. Does NOT alter existing Instagram connections,
-- knowledge, content, stories, billing, or usage tables.
--
-- Production: NOT applied by agent. No db push / deploy.
-- ============================================================

create table if not exists public.team_radar_user_state (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null
    references public.organizations (id) on delete restrict
    default public.current_org_id(),
  user_id uuid not null
    references public.profiles (id) on delete cascade,
  -- UTC instant of successful radar activation. Immutable on poll.
  radar_started_at timestamptz not null,
  enabled boolean not null default true,
  paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_radar_user_state_org_user_key unique (org_id, user_id)
);

create index if not exists team_radar_user_state_org_user_idx
  on public.team_radar_user_state (org_id, user_id);

comment on column public.team_radar_user_state.radar_started_at is
  'UTC activation boundary. Filter Instagram published_at >= this. Never rewrite on poll.';

alter table public.team_radar_user_state enable row level security;

drop policy if exists team_radar_user_state_select on public.team_radar_user_state;
create policy team_radar_user_state_select
on public.team_radar_user_state for select
to authenticated
using (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
  and user_id = auth.uid()
);

drop policy if exists team_radar_user_state_insert on public.team_radar_user_state;
create policy team_radar_user_state_insert
on public.team_radar_user_state for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
  and user_id = auth.uid()
  -- Org #1 Team Seyda radar only (hard product gate)
  and org_id = '00000000-0000-0000-0000-000000000001'::uuid
);

drop policy if exists team_radar_user_state_update on public.team_radar_user_state;
create policy team_radar_user_state_update
on public.team_radar_user_state for update
to authenticated
using (
  org_id = public.current_org_id()
  and user_id = auth.uid()
  and org_id = '00000000-0000-0000-0000-000000000001'::uuid
)
with check (
  org_id = public.current_org_id()
  and user_id = auth.uid()
  and org_id = '00000000-0000-0000-0000-000000000001'::uuid
);

revoke all on public.team_radar_user_state from public;
grant select, insert, update on public.team_radar_user_state to authenticated;
grant all on public.team_radar_user_state to service_role;

-- Optional lightweight item ledger for dedupe (no media copy). Empty until poll exists.
create table if not exists public.team_radar_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null
    references public.organizations (id) on delete restrict
    default public.current_org_id(),
  user_id uuid not null
    references public.profiles (id) on delete cascade,
  source text not null check (source in ('chogan', 'essence_tribe')),
  external_id text not null,
  content_type text not null check (content_type in ('POST', 'REEL')),
  published_at timestamptz not null,
  detected_at timestamptz not null default now(),
  canonical_url text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint team_radar_items_user_source_ext_key unique (user_id, source, external_id)
);

create index if not exists team_radar_items_user_unresolved_idx
  on public.team_radar_items (user_id, org_id)
  where resolved_at is null;

alter table public.team_radar_items enable row level security;

drop policy if exists team_radar_items_select on public.team_radar_items;
create policy team_radar_items_select
on public.team_radar_items for select
to authenticated
using (
  org_id = public.current_org_id()
  and user_id = auth.uid()
  and org_id = '00000000-0000-0000-0000-000000000001'::uuid
);

drop policy if exists team_radar_items_insert on public.team_radar_items;
create policy team_radar_items_insert
on public.team_radar_items for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and user_id = auth.uid()
  and org_id = '00000000-0000-0000-0000-000000000001'::uuid
);

drop policy if exists team_radar_items_update on public.team_radar_items;
create policy team_radar_items_update
on public.team_radar_items for update
to authenticated
using (
  org_id = public.current_org_id()
  and user_id = auth.uid()
  and org_id = '00000000-0000-0000-0000-000000000001'::uuid
)
with check (
  org_id = public.current_org_id()
  and user_id = auth.uid()
  and org_id = '00000000-0000-0000-0000-000000000001'::uuid
);

revoke all on public.team_radar_items from public;
grant select, insert, update on public.team_radar_items to authenticated;
grant all on public.team_radar_items to service_role;
