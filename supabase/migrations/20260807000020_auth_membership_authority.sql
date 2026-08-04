-- ============================================================
-- Migration 20: memberships.role is the only authority
--
-- profiles.role/org_id/team_id remain a read-only mirror (sync from
-- memberships). active_membership_id() keeps the explicit
-- x-ascendos-org selector and the single-membership auto-resolve;
-- when multiple memberships exist without a header, the profile
-- mirror org_id is used as a non-authoritative fallback so existing
-- single-org sessions keep working.
--
-- RLS policies are NOT changed.
-- ============================================================

-- 1) Ensure every profile has an active membership (idempotent).
insert into public.memberships
  (identity_id, org_id, team_id, role, status, country, goals, joined_at, created_at)
select p.id, p.org_id, p.team_id, p.role, 'active', p.country, p.goals, p.created_at, p.created_at
from public.profiles p
where p.org_id is not null
  and p.team_id is not null
  and not exists (
    select 1 from public.memberships m
    where m.identity_id = p.id
      and m.org_id = p.org_id
      and m.status = 'active'
  );

-- 2) Mirror: membership wins. Repair drifted profiles.role / org / team.
-- Prefer the membership that already matches profiles.org_id; else oldest.
do $$
begin
  perform set_config('ascendos.mirror_sync', 'on', true);

  update public.profiles p
  set role    = s.role,
      org_id  = s.org_id,
      team_id = s.team_id
  from (
    select distinct on (m.identity_id)
      m.identity_id,
      m.role,
      m.org_id,
      m.team_id
    from public.memberships m
    join public.profiles pr on pr.id = m.identity_id
    where m.status = 'active'
    order by
      m.identity_id,
      (m.org_id = pr.org_id) desc,
      m.joined_at asc nulls last,
      m.created_at asc
  ) s
  where p.id = s.identity_id
    and (
      p.role is distinct from s.role
      or p.org_id is distinct from s.org_id
      or p.team_id is distinct from s.team_id
    );
end $$;

-- 3) active_membership_id — same contract + mirror-org fallback
create or replace function public.active_membership_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_selektor uuid;
  v_treffer  uuid;
  v_anzahl   int;
  v_mirror   uuid;
begin
  if v_uid is null then
    return null;
  end if;

  begin
    v_selektor := nullif(
      (current_setting('request.headers', true)::json ->> 'x-ascendos-org'), ''
    )::uuid;
  exception when others then
    v_selektor := null;
  end;

  if v_selektor is not null then
    select m.id into v_treffer
    from public.memberships m
    where m.identity_id = v_uid
      and m.org_id      = v_selektor
      and m.status      = 'active';
    return v_treffer;
  end if;

  select count(*) into v_anzahl
  from public.memberships m
  where m.identity_id = v_uid and m.status = 'active';

  if v_anzahl = 1 then
    select m.id into v_treffer
    from public.memberships m
    where m.identity_id = v_uid and m.status = 'active';
    return v_treffer;
  end if;

  if v_anzahl < 1 then
    return null;
  end if;

  -- Multiple memberships, no header: prefer mirrored profiles.org_id.
  select p.org_id into v_mirror from public.profiles p where p.id = v_uid;

  if v_mirror is not null then
    select m.id into v_treffer
    from public.memberships m
    where m.identity_id = v_uid
      and m.org_id = v_mirror
      and m.status = 'active';
    if v_treffer is not null then
      return v_treffer;
    end if;
  end if;

  return null;
end;
$$;

comment on function public.active_membership_id() is
  'Validated active membership. Selector x-ascendos-org preferred; single active membership auto-resolves; multi without header falls back to profiles.org_id mirror.';

-- Helpers stay membership-backed (reassert for clarity; no policy changes).
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.memberships m
  where m.id = public.active_membership_id();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select m.role = 'super_admin' from public.memberships m
     where m.id = public.active_membership_id()),
    false
  );
$$;

grant execute on function public.active_membership_id() to anon, authenticated, service_role;
grant execute on function public.current_user_role()    to anon, authenticated, service_role;
grant execute on function public.is_super_admin()       to anon, authenticated, service_role;

-- Allow reading organization names for every org the identity belongs to
-- (needed for the active-org switcher). Existing select policy kept.
drop policy if exists organizations_select_own_memberships on public.organizations;
create policy organizations_select_own_memberships
  on public.organizations for select
  using (
    exists (
      select 1 from public.memberships m
      where m.identity_id = auth.uid()
        and m.org_id = organizations.id
        and m.status = 'active'
    )
  );
