-- ============================================================
-- Team Seyda Radar — per-user startpoint (additive only)
--
-- Audit:
--   • No prior radar tables/columns existed.
--   • content_instagram_connections = own publish OAuth only
--     (wrong place for Chogan/Essence watch startpoint).
--   • memberships / profiles = shared tenancy; adding radar
--     columns would pollute every org and mix concerns.
--   → New Org-#1-scoped tables are the minimal safe surface.
--
-- Purpose:
--   Persist radar_started_at once per (org, user) in UTC.
--   No backfill. No historical Instagram import.
--   Existing users without a row = no startpoint (NULL semantics).
--
-- Safety:
--   ADDITIVE / LOW RISK / REVERSIBLE (see bottom).
--   No DROP/DELETE/TRUNCATE/UPDATE of existing product data.
--   Production: NOT applied by agent. No db push / deploy.
-- ============================================================

-- ---------- Per-user activation boundary ---------------------------------
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
  constraint team_radar_user_state_org_user_key unique (org_id, user_id),
  -- Product gate: Team Seyda / Org #1 only
  constraint team_radar_user_state_org1_only check (
    org_id = '00000000-0000-0000-0000-000000000001'::uuid
  )
);

create index if not exists team_radar_user_state_org_user_idx
  on public.team_radar_user_state (org_id, user_id);

comment on table public.team_radar_user_state is
  'Per-user Team Seyda Radar activation state. No row = never activated (no startpoint).';

comment on column public.team_radar_user_state.radar_started_at is
  'UTC activation boundary. Filter Instagram published_at >= this. Never rewrite on poll.';

-- Defense in depth: poll/login must not move radar_started_at.
-- Explicit restart: set local ascendos.radar_allow_restart = 'on'
-- or use service_role.
create or replace function public.team_radar_protect_started_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.radar_started_at is distinct from old.radar_started_at then
    if coalesce(current_setting('ascendos.radar_allow_restart', true), '') = 'on' then
      null; -- explicit controlled restart
    elsif auth.role() = 'service_role' then
      null; -- edge/service controlled restart
    else
      raise exception 'radar_started_at is immutable after activation'
        using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists team_radar_user_state_protect_started_at
  on public.team_radar_user_state;
create trigger team_radar_user_state_protect_started_at
  before update on public.team_radar_user_state
  for each row execute function public.team_radar_protect_started_at();

alter table public.team_radar_user_state enable row level security;

drop policy if exists team_radar_user_state_select on public.team_radar_user_state;
create policy team_radar_user_state_select
on public.team_radar_user_state for select
to authenticated
using (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
  and user_id = auth.uid()
  and org_id = '00000000-0000-0000-0000-000000000001'::uuid
);

drop policy if exists team_radar_user_state_insert on public.team_radar_user_state;
create policy team_radar_user_state_insert
on public.team_radar_user_state for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
  and user_id = auth.uid()
  and org_id = '00000000-0000-0000-0000-000000000001'::uuid
);

drop policy if exists team_radar_user_state_update on public.team_radar_user_state;
create policy team_radar_user_state_update
on public.team_radar_user_state for update
to authenticated
using (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
  and user_id = auth.uid()
  and org_id = '00000000-0000-0000-0000-000000000001'::uuid
)
with check (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
  and user_id = auth.uid()
  and org_id = '00000000-0000-0000-0000-000000000001'::uuid
);

-- No DELETE policy for authenticated — startpoint rows are retained.
revoke all on public.team_radar_user_state from public;
grant select, insert, update on public.team_radar_user_state to authenticated;
grant all on public.team_radar_user_state to service_role;

-- ---------- Per-user hit ledger (dedupe; empty until poll exists) ---------
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
  constraint team_radar_items_org_user_source_ext_key
    unique (org_id, user_id, source, external_id),
  constraint team_radar_items_org1_only check (
    org_id = '00000000-0000-0000-0000-000000000001'::uuid
  )
);

create index if not exists team_radar_items_user_unresolved_idx
  on public.team_radar_items (user_id, org_id)
  where resolved_at is null;

comment on table public.team_radar_items is
  'Per-user radar hits after radar_started_at. Dedupe by org+user+source+external_id. No media copy.';

alter table public.team_radar_items enable row level security;

drop policy if exists team_radar_items_select on public.team_radar_items;
create policy team_radar_items_select
on public.team_radar_items for select
to authenticated
using (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
  and user_id = auth.uid()
  and org_id = '00000000-0000-0000-0000-000000000001'::uuid
);

drop policy if exists team_radar_items_insert on public.team_radar_items;
create policy team_radar_items_insert
on public.team_radar_items for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
  and user_id = auth.uid()
  and org_id = '00000000-0000-0000-0000-000000000001'::uuid
);

drop policy if exists team_radar_items_update on public.team_radar_items;
create policy team_radar_items_update
on public.team_radar_items for update
to authenticated
using (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
  and user_id = auth.uid()
  and org_id = '00000000-0000-0000-0000-000000000001'::uuid
)
with check (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
  and user_id = auth.uid()
  and org_id = '00000000-0000-0000-0000-000000000001'::uuid
);

revoke all on public.team_radar_items from public;
grant select, insert, update on public.team_radar_items to authenticated;
grant all on public.team_radar_items to service_role;

-- ============================================================
-- REVERSE (manual — not auto-applied):
--   drop trigger if exists team_radar_user_state_protect_started_at
--     on public.team_radar_user_state;
--   drop function if exists public.team_radar_protect_started_at();
--   drop table if exists public.team_radar_items;
--   drop table if exists public.team_radar_user_state;
-- No other tables/columns are touched by this migration.
-- ============================================================
