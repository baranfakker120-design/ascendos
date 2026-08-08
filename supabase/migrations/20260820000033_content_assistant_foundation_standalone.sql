-- ============================================================
-- Migration 33: AI Content Assistant foundation (STANDALONE BRIDGE)
--
-- Purpose:
--   Make Content Assistant work on the current production remote schema
--   WITHOUT replaying migrations 00015–00031.
--
-- Remote reality (analyzed):
--   - memberships + active_membership_id()/current_org_id() already exist
--   - is_coach_content_manager() and content_* objects are missing
--
-- ADDITIVE ONLY:
--   - minimal helper is_coach_content_manager()
--   - content tables / RPCs / RLS / private storage bucket
--   - organizations.settings jsonb merge for content_asset_limit
--
-- Does NOT alter Auth, Memberships schema, AP, Contacts, Team/Genealogy,
-- Coach tables, Profile schema, Chats, Sync, or existing domain policies.
-- Does NOT replay 00015–00031.
-- Idempotent where practical (IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS).
-- ============================================================

-- ---------- Minimal helper (required by content central-scope RLS) ----------
-- Same contract as migration 28 helper, but WITHOUT Knowledge/Live/Stories objects.
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
grant execute on function public.is_coach_content_manager() to authenticated;

-- ---------- Org setting default (jsonb merge; preserve existing keys) -------
update public.organizations
set settings = coalesce(settings, '{}'::jsonb) || '{"content_asset_limit": 25}'::jsonb
where coalesce(settings->>'content_asset_limit', '') = '';

-- ---------- content_assets -------------------------------------------------
create table if not exists public.content_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  owner_membership_id uuid not null references public.memberships (id) on delete cascade,
  created_by uuid not null references auth.users (id),
  scope text not null default 'personal'
    check (scope in ('personal', 'central')),
  media_kind text not null
    check (media_kind in ('image', 'video')),
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 52428800),
  width_px integer,
  height_px integer,
  aspect_ratio text,
  suggested_formats text[] not null default '{}'::text[],
  title text,
  theme text,
  detected_summary text,
  keywords text[] not null default '{}'::text[],
  mood text,
  product_hint text,
  audience_hint text,
  analysis_status text not null default 'pending'
    check (analysis_status in ('pending', 'ready', 'failed', 'skipped')),
  analysis_json jsonb not null default '{}'::jsonb,
  last_used_at timestamptz,
  usage_count integer not null default 0 check (usage_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_assets_storage_path_unique unique (storage_path)
);

create index if not exists content_assets_org_owner_idx
  on public.content_assets (org_id, owner_membership_id, created_at desc);
create index if not exists content_assets_org_scope_idx
  on public.content_assets (org_id, scope, created_at desc);

comment on table public.content_assets is
  'AI Content Assistant media library. Original storage_path is immutable; never overwrite binaries.';

-- ---------- content_drafts -------------------------------------------------
create table if not exists public.content_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  asset_id uuid not null references public.content_assets (id) on delete cascade,
  owner_membership_id uuid not null references public.memberships (id) on delete cascade,
  format text not null check (format in ('story', 'feed', 'reel')),
  hook text,
  caption text,
  cta text,
  keywords text[] not null default '{}'::text[],
  hashtags text[] not null default '{}'::text[],
  clean_check_status text not null default 'pending'
    check (clean_check_status in ('pending', 'clean', 'attention')),
  clean_check_notes text,
  target_audience text,
  posting_hint text,
  content_score numeric(5, 2),
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_drafts_org_owner_idx
  on public.content_drafts (org_id, owner_membership_id, created_at desc);
create index if not exists content_drafts_asset_idx
  on public.content_drafts (asset_id);

comment on table public.content_drafts is
  'Prepared captions/hooks/hashtags for an asset. User must confirm before any publish attempt.';

-- ---------- Daily preparation (12:00 job target) ----------------------------
create table if not exists public.content_daily_preparations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  prep_date date not null,
  timezone text not null default 'Europe/Berlin',
  draft_id uuid references public.content_drafts (id) on delete set null,
  asset_id uuid references public.content_assets (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'skipped', 'failed')),
  score numeric(5, 2),
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_daily_preparations_unique unique (org_id, membership_id, prep_date)
);

create index if not exists content_daily_preparations_date_idx
  on public.content_daily_preparations (prep_date, status);

comment on table public.content_daily_preparations is
  'One prepared content slot per member per calendar day (target job 12:00 Europe/Berlin).';

-- ---------- Instagram connection architecture (no passwords/tokens here) ---
create table if not exists public.content_instagram_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  ig_user_id text,
  ig_username text,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'pending_review', 'connected', 'error')),
  scopes text[] not null default '{}'::text[],
  -- Tokens MUST NOT be stored as plaintext. Phase 6: Edge-managed secret/vault only.
  token_ref text,
  last_error text,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_instagram_connections_member unique (org_id, membership_id)
);

comment on table public.content_instagram_connections is
  'Instagram OAuth connection metadata only. No passwords. Tokens via token_ref/vault later. Requires Meta App Review for publish.';

-- ---------- Publish attempts (explicit user confirm only) ------------------
create table if not exists public.content_publish_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  draft_id uuid not null references public.content_drafts (id) on delete cascade,
  connection_id uuid references public.content_instagram_connections (id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'submitted', 'published', 'failed', 'cancelled')),
  meta_container_id text,
  meta_media_id text,
  error_message text,
  user_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_publish_attempts_draft_idx
  on public.content_publish_attempts (draft_id, created_at desc);

comment on table public.content_publish_attempts is
  'Official Graph API publish attempts after explicit user confirmation. No unofficial bots.';

-- ---------- updated_at helper ---------------------------------------------
create or replace function public.content_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists content_assets_set_updated_at on public.content_assets;
create trigger content_assets_set_updated_at
  before update on public.content_assets
  for each row execute function public.content_set_updated_at();

drop trigger if exists content_drafts_set_updated_at on public.content_drafts;
create trigger content_drafts_set_updated_at
  before update on public.content_drafts
  for each row execute function public.content_set_updated_at();

drop trigger if exists content_daily_preparations_set_updated_at on public.content_daily_preparations;
create trigger content_daily_preparations_set_updated_at
  before update on public.content_daily_preparations
  for each row execute function public.content_set_updated_at();

drop trigger if exists content_instagram_connections_set_updated_at on public.content_instagram_connections;
create trigger content_instagram_connections_set_updated_at
  before update on public.content_instagram_connections
  for each row execute function public.content_set_updated_at();

drop trigger if exists content_publish_attempts_set_updated_at on public.content_publish_attempts;
create trigger content_publish_attempts_set_updated_at
  before update on public.content_publish_attempts
  for each row execute function public.content_set_updated_at();

-- ---------- Quota helpers (separate from coach quota) ---------------------
create or replace function public.content_asset_limit()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    1,
    least(
      500,
      coalesce(
        (
          select nullif(o.settings->>'content_asset_limit', '')::integer
          from public.organizations o
          where o.id = public.current_org_id()
        ),
        25
      )
    )
  );
$$;

create or replace function public.content_personal_asset_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.content_assets a
  where a.org_id = public.current_org_id()
    and a.owner_membership_id = public.active_membership_id()
    and a.scope = 'personal';
$$;

create or replace function public.content_can_upload_asset(p_scope text default 'personal')
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_org_id() is null or public.active_membership_id() is null then
    return false;
  end if;
  if p_scope = 'central' then
    return public.is_coach_content_manager();
  end if;
  if p_scope <> 'personal' then
    return false;
  end if;
  return public.content_personal_asset_count() < public.content_asset_limit();
end;
$$;

revoke all on function public.content_asset_limit() from public;
revoke all on function public.content_personal_asset_count() from public;
revoke all on function public.content_can_upload_asset(text) from public;
grant execute on function public.content_asset_limit() to authenticated;
grant execute on function public.content_personal_asset_count() to authenticated;
grant execute on function public.content_can_upload_asset(text) to authenticated;

-- Enforce personal quota on insert
create or replace function public.content_assets_enforce_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scope = 'personal' then
    if (
      select count(*)
      from public.content_assets a
      where a.org_id = new.org_id
        and a.owner_membership_id = new.owner_membership_id
        and a.scope = 'personal'
    ) >= public.content_asset_limit() then
      raise exception 'content_asset_limit_reached' using errcode = 'P0001';
    end if;
  elsif new.scope = 'central' and not public.is_coach_content_manager() then
    raise exception 'content_central_forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists content_assets_enforce_quota on public.content_assets;
create trigger content_assets_enforce_quota
  before insert on public.content_assets
  for each row execute function public.content_assets_enforce_quota();

-- ---------- RLS -----------------------------------------------------------
alter table public.content_assets enable row level security;
alter table public.content_drafts enable row level security;
alter table public.content_daily_preparations enable row level security;
alter table public.content_instagram_connections enable row level security;
alter table public.content_publish_attempts enable row level security;

drop policy if exists content_assets_select on public.content_assets;
create policy content_assets_select on public.content_assets
  for select to authenticated
  using (
    org_id = public.current_org_id()
    and (
      owner_membership_id = public.active_membership_id()
      or scope = 'central'
      or public.is_coach_content_manager()
    )
  );

drop policy if exists content_assets_insert on public.content_assets;
create policy content_assets_insert on public.content_assets
  for insert to authenticated
  with check (
    org_id = public.current_org_id()
    and created_by = auth.uid()
    and owner_membership_id = public.active_membership_id()
    and (
      scope = 'personal'
      or (scope = 'central' and public.is_coach_content_manager())
    )
  );

drop policy if exists content_assets_update on public.content_assets;
create policy content_assets_update on public.content_assets
  for update to authenticated
  using (
    org_id = public.current_org_id()
    and (
      (scope = 'personal' and owner_membership_id = public.active_membership_id())
      or (scope = 'central' and public.is_coach_content_manager())
    )
  )
  with check (
    org_id = public.current_org_id()
    and (
      (scope = 'personal' and owner_membership_id = public.active_membership_id())
      or (scope = 'central' and public.is_coach_content_manager())
    )
  );

drop policy if exists content_assets_delete on public.content_assets;
create policy content_assets_delete on public.content_assets
  for delete to authenticated
  using (
    org_id = public.current_org_id()
    and (
      (scope = 'personal' and owner_membership_id = public.active_membership_id())
      or (scope = 'central' and public.is_coach_content_manager())
    )
  );

drop policy if exists content_drafts_select on public.content_drafts;
create policy content_drafts_select on public.content_drafts
  for select to authenticated
  using (
    org_id = public.current_org_id()
    and (
      owner_membership_id = public.active_membership_id()
      or public.is_coach_content_manager()
    )
  );

drop policy if exists content_drafts_write on public.content_drafts;
create policy content_drafts_write on public.content_drafts
  for all to authenticated
  using (
    org_id = public.current_org_id()
    and owner_membership_id = public.active_membership_id()
  )
  with check (
    org_id = public.current_org_id()
    and owner_membership_id = public.active_membership_id()
  );

drop policy if exists content_daily_preparations_own on public.content_daily_preparations;
create policy content_daily_preparations_own on public.content_daily_preparations
  for all to authenticated
  using (
    org_id = public.current_org_id()
    and membership_id = public.active_membership_id()
  )
  with check (
    org_id = public.current_org_id()
    and membership_id = public.active_membership_id()
  );

drop policy if exists content_instagram_connections_own on public.content_instagram_connections;
create policy content_instagram_connections_own on public.content_instagram_connections
  for all to authenticated
  using (
    org_id = public.current_org_id()
    and membership_id = public.active_membership_id()
  )
  with check (
    org_id = public.current_org_id()
    and membership_id = public.active_membership_id()
  );

drop policy if exists content_publish_attempts_own on public.content_publish_attempts;
create policy content_publish_attempts_own on public.content_publish_attempts
  for all to authenticated
  using (
    org_id = public.current_org_id()
    and membership_id = public.active_membership_id()
  )
  with check (
    org_id = public.current_org_id()
    and membership_id = public.active_membership_id()
  );

-- ---------- Private storage bucket ----------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-assets',
  'content-assets',
  false,
  52428800, -- 50 MiB
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path conventions:
--   personal: {org_id}/{auth.uid()}/{asset_id}/original.<ext>
--   central:  {org_id}/central/{asset_id}/original.<ext>

drop policy if exists content_assets_storage_select on storage.objects;
drop policy if exists content_assets_storage_insert on storage.objects;
drop policy if exists content_assets_storage_update on storage.objects;
drop policy if exists content_assets_storage_delete on storage.objects;

create policy content_assets_storage_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'content-assets'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or (storage.foldername(name))[2] = 'central'
    )
  );

create policy content_assets_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'content-assets'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or (
        (storage.foldername(name))[2] = 'central'
        and public.is_coach_content_manager()
      )
    )
  );

-- Updates forbidden for originals (immutability). No update policy on purpose.

create policy content_assets_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'content-assets'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or (
        (storage.foldername(name))[2] = 'central'
        and public.is_coach_content_manager()
      )
    )
  );
