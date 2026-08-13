-- ============================================================
-- Migration 43: Phase 2 — Platform principal + org-admin helpers
--
-- ADR 0006 (PROPOSED→accepted for Phase 2 implementation):
--   PLATFORM_SUPER_ADMIN lives in public.platform_admins,
--   NEVER in memberships.role.
--
-- Hard rules:
--   - Do NOT auto-promote existing memberships.role = super_admin
--   - Do NOT seed any production identity into platform_admins
--   - is_super_admin() semantics UNCHANGED (org-scoped via active membership)
--   - Bootstrap of the first platform admin is service_role / ops only
--
-- Out of scope (later phases): CMS, live coaching, stories, push,
-- coach-chat, ingest, FE /platform-admin UI, Autopilot.
-- ============================================================

-- ---------- platform_admins ----------
create table if not exists public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.profiles (id) on delete cascade,
  is_active boolean not null default true,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_admins_identity_unique unique (identity_id),
  constraint platform_admins_active_revoked_chk check (
    (is_active = true and revoked_at is null)
    or (is_active = false)
  )
);

comment on table public.platform_admins is
  'Platform-level operators (PLATFORM_SUPER_ADMIN). Separate from memberships.role. No auto-seed from org super_admin.';

comment on column public.platform_admins.identity_id is
  'Auth identity (profiles.id = auth.users.id).';

comment on column public.platform_admins.is_active is
  'Soft disable without deleting the audit row. Inactive rows are never platform admins.';

create index if not exists platform_admins_active_identity_idx
  on public.platform_admins (identity_id)
  where is_active = true and revoked_at is null;

drop trigger if exists platform_admins_set_updated_at on public.platform_admins;
create trigger platform_admins_set_updated_at
before update on public.platform_admins
for each row execute function public.set_updated_at();

-- ---------- Privileges: deny by default; RLS grants row access ----------
revoke all on table public.platform_admins from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_admins to authenticated;
grant all on table public.platform_admins to service_role;

alter table public.platform_admins enable row level security;

-- ---------- Helpers (before policies that call them) ----------

-- PLATFORM_SUPER_ADMIN: explicit platform_admins row only.
create or replace function public.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.identity_id = auth.uid()
      and pa.is_active = true
      and pa.revoked_at is null
  );
$$;

comment on function public.is_platform_super_admin() is
  'True iff auth.uid() has an active platform_admins row. Independent of memberships.role / is_super_admin().';

-- ORGANIZATION_ADMIN (compatibility helper): active membership role in
-- (super_admin, admin). Does NOT grant platform power.
create or replace function public.is_organization_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select m.role in ('super_admin', 'admin')
      from public.memberships m
      where m.id = public.active_membership_id()
    ),
    false
  );
$$;

comment on function public.is_organization_admin() is
  'Org-scoped admin for the validated active membership (super_admin|admin). Never platform-wide.';

-- Preserve existing is_super_admin() contract (org-scoped, role = super_admin only).
-- Re-assert definition so Phase 2 docs/search_path stay explicit; behavior unchanged.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select m.role = 'super_admin'
      from public.memberships m
      where m.id = public.active_membership_id()
    ),
    false
  );
$$;

comment on function public.is_super_admin() is
  'Org-scoped: active membership role = super_admin. NOT platform admin (see is_platform_super_admin).';

revoke all on function public.is_platform_super_admin() from public;
revoke all on function public.is_organization_admin() from public;
grant execute on function public.is_platform_super_admin() to anon, authenticated, service_role;
grant execute on function public.is_organization_admin() to anon, authenticated, service_role;
grant execute on function public.is_super_admin() to anon, authenticated, service_role;

-- ---------- RLS: only active platform admins may manage the table ----------
drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select
  on public.platform_admins
  for select
  to authenticated
  using (public.is_platform_super_admin());

drop policy if exists platform_admins_insert on public.platform_admins;
create policy platform_admins_insert
  on public.platform_admins
  for insert
  to authenticated
  with check (public.is_platform_super_admin());

drop policy if exists platform_admins_update on public.platform_admins;
create policy platform_admins_update
  on public.platform_admins
  for update
  to authenticated
  using (public.is_platform_super_admin())
  with check (public.is_platform_super_admin());

drop policy if exists platform_admins_delete on public.platform_admins;
create policy platform_admins_delete
  on public.platform_admins
  for delete
  to authenticated
  using (public.is_platform_super_admin());

-- ---------- Bootstrap note (no data mutation) ----------
-- First PLATFORM_SUPER_ADMIN must be inserted by a trusted operator using
-- service_role (bypasses RLS), e.g.:
--   insert into public.platform_admins (identity_id, notes)
--   values ('<known-identity-uuid>', 'bootstrap');
-- Never auto-copy from memberships.role = 'super_admin'.
