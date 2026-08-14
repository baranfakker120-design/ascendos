-- ============================================================
-- Phase 9 — Organization Admin write surface
--
-- Widen org-scoped admin writes from is_super_admin()-only to
-- is_organization_admin() (super_admin | admin) for the ACTIVE org.
--
-- Hard rules:
--   - Never grants platform_admins access
--   - Never uses profiles.org_id as authority
--   - RPCs bind exclusively to current_org_id() / active_membership_id()
--   - organizations.name is NOT writable via branding RPC (ADR 0007)
--   - No production apply by agent
-- ============================================================

-- ---------- protect_membership_columns: org admins may change role/status ----------
create or replace function public.protect_membership_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Org admins (super_admin|admin) for the active org may change protected fields.
  -- Field-level role matrix is enforced in org_admin_set_membership_* RPCs;
  -- direct table updates by org admin remain allowed under memberships_admin_write.
  if public.is_organization_admin() then
    return new;
  end if;

  if new.role     is distinct from old.role
     or new.org_id  is distinct from old.org_id
     or new.team_id is distinct from old.team_id
     or new.sponsor_membership_id is distinct from old.sponsor_membership_id
     or new.status  is distinct from old.status
     or new.identity_id is distinct from old.identity_id then
    raise exception 'AscendOS: Rolle, Organisation, Team, Sponsor und Status koennen nicht selbst geaendert werden.';
  end if;

  return new;
end;
$$;

-- ---------- Memberships SELECT: org admins see all members of active org ----------
drop policy if exists memberships_select_own_or_downline on public.memberships;
create policy memberships_select_own_or_downline
  on public.memberships for select
  using (
    identity_id = auth.uid()
    or (
      org_id = public.current_org_id()
      and (
        public.is_organization_admin()
        or public.is_ancestor_of(identity_id)
      )
    )
  );

drop policy if exists memberships_admin_write on public.memberships;
create policy memberships_admin_write
  on public.memberships for all
  using (public.is_organization_admin() and org_id = public.current_org_id())
  with check (public.is_organization_admin() and org_id = public.current_org_id());

-- ---------- Organizations branding/settings update ----------
drop policy if exists organizations_update_admin on public.organizations;
create policy organizations_update_admin on public.organizations
  for update
  using (public.is_organization_admin() and id = public.current_org_id())
  with check (public.is_organization_admin() and id = public.current_org_id());

-- ---------- External tools ----------
drop policy if exists external_tools_admin_insert on public.external_tools;
create policy external_tools_admin_insert on public.external_tools
  for insert
  with check (public.is_organization_admin() and org_id = public.current_org_id());

drop policy if exists external_tools_admin_update on public.external_tools;
create policy external_tools_admin_update on public.external_tools
  for update
  using (public.is_organization_admin() and org_id = public.current_org_id())
  with check (public.is_organization_admin() and org_id = public.current_org_id());

-- ---------- Agents (coach config) ----------
drop policy if exists agents_admin_all on public.agents;
create policy agents_admin_all on public.agents
  for all
  using (public.is_organization_admin() and org_id = public.current_org_id())
  with check (public.is_organization_admin() and org_id = public.current_org_id());

-- ---------- Invites SELECT: org admins see org invites ----------
drop policy if exists invites_select_own on public.invites;
create policy invites_select_own on public.invites
  for select
  using (
    created_by = auth.uid()
    or (public.is_organization_admin() and org_id = public.current_org_id())
  );

-- ---------- usage_events: allow Phase 9 admin audit types ----------
alter table public.usage_events drop constraint if exists usage_events_event_type_check;
alter table public.usage_events add constraint usage_events_event_type_check
  check (event_type in (
    'app_opened', 'plan_committed', 'mission_completed', 'mission_skipped',
    'coach_message_sent', 'contact_created', 'journey_step_completed',
    'org_admin_branding_updated',
    'org_admin_tool_upserted',
    'org_admin_membership_role_changed',
    'org_admin_membership_status_changed',
    'org_admin_agent_updated'
  ));

-- ---------- Protect organizations.name (ADR 0007) ----------
create or replace function public.protect_organization_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    raise exception 'AscendOS: organizations.name kann nicht geändert werden.';
  end if;
  if new.id is distinct from old.id then
    raise exception 'AscendOS: Organisation oder Ressource nicht gefunden.';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_protect_columns on public.organizations;
create trigger organizations_protect_columns
  before update on public.organizations
  for each row execute function public.protect_organization_columns();

-- Org admins may list inactive tools for management.
drop policy if exists external_tools_admin_select on public.external_tools;
create policy external_tools_admin_select on public.external_tools
  for select
  using (public.is_organization_admin() and org_id = public.current_org_id());

-- Org admins may read profiles of identities that have a membership
-- in the active org (profiles.org_id is only a display mirror).
drop policy if exists profiles_select_org_admin_members on public.profiles;
create policy profiles_select_org_admin_members on public.profiles
  for select
  using (
    public.is_organization_admin()
    and exists (
      select 1
      from public.memberships m
      where m.identity_id = profiles.id
        and m.org_id = public.current_org_id()
    )
  );

-- ============================================================
-- RPCs — always bound to current_org_id(); ignore client org_id
-- ============================================================

create or replace function public.org_admin_update_branding(p_branding jsonb)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_row public.organizations;
begin
  if not public.is_organization_admin() then
    raise exception 'AscendOS: Keine Berechtigung für diesen Bereich.' using errcode = '42501';
  end if;
  if v_org_id is null then
    raise exception 'AscendOS: Keine aktive Organisation.';
  end if;
  if p_branding is null or jsonb_typeof(p_branding) <> 'object' then
    raise exception 'AscendOS: Ungültige Branding-Daten.';
  end if;

  -- Merge branding only — never touch organizations.name (ADR 0007).
  update public.organizations
  set branding = coalesce(branding, '{}'::jsonb) || p_branding
  where id = v_org_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'AscendOS: Organisation oder Ressource nicht gefunden.';
  end if;

  insert into public.usage_events (user_id, org_id, event_type, metadata)
  values (
    auth.uid(),
    v_org_id,
    'org_admin_branding_updated',
    jsonb_build_object(
      'keys',
      coalesce(
        (select jsonb_agg(to_jsonb(k)) from jsonb_object_keys(p_branding) as k),
        '[]'::jsonb
      )
    )
  );

  return v_row;
end;
$$;

revoke all on function public.org_admin_update_branding(jsonb) from public, anon;
grant execute on function public.org_admin_update_branding(jsonb) to authenticated, service_role;

comment on function public.org_admin_update_branding(jsonb) is
  'Phase 9: merge branding JSON for current_org_id only. Does not change organizations.name.';

-- ---------- Upsert external tool (org forced) ----------
create or replace function public.org_admin_upsert_external_tool(
  p_key text,
  p_name text,
  p_url text,
  p_description text default null,
  p_share_event_type text default null,
  p_result_event_type text default null,
  p_sort_order int default 100,
  p_is_active boolean default true
)
returns public.external_tools
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_row public.external_tools;
begin
  if not public.is_organization_admin() then
    raise exception 'AscendOS: Keine Berechtigung für diesen Bereich.' using errcode = '42501';
  end if;
  if v_org_id is null then
    raise exception 'AscendOS: Keine aktive Organisation.';
  end if;
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'AscendOS: Tool-Schlüssel fehlt.';
  end if;
  if p_url is null or length(trim(p_url)) = 0 then
    raise exception 'AscendOS: Tool-URL fehlt.';
  end if;

  insert into public.external_tools as t
    (org_id, key, name, description, url, share_event_type, result_event_type, sort_order, is_active)
  values (
    v_org_id,
    lower(trim(p_key)),
    coalesce(nullif(trim(p_name), ''), initcap(trim(p_key))),
    nullif(trim(p_description), ''),
    trim(p_url),
    coalesce(nullif(trim(p_share_event_type), ''), 'contact_created'),
    nullif(trim(p_result_event_type), ''),
    coalesce(p_sort_order, 100),
    coalesce(p_is_active, true)
  )
  on conflict (org_id, key) do update
    set name = excluded.name,
        description = excluded.description,
        url = excluded.url,
        share_event_type = excluded.share_event_type,
        result_event_type = excluded.result_event_type,
        sort_order = excluded.sort_order,
        is_active = excluded.is_active
  returning * into v_row;

  insert into public.usage_events (user_id, org_id, event_type, metadata)
  values (
    auth.uid(),
    v_org_id,
    'org_admin_tool_upserted',
    jsonb_build_object('key', v_row.key)
  );

  return v_row;
end;
$$;

revoke all on function public.org_admin_upsert_external_tool(text, text, text, text, text, text, int, boolean) from public, anon;
grant execute on function public.org_admin_upsert_external_tool(text, text, text, text, text, text, int, boolean) to authenticated, service_role;

-- ---------- Membership role (org-scoped; platform roles impossible) ----------
create or replace function public.org_admin_set_membership_role(
  p_membership_id uuid,
  p_role text
)
returns public.memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_caller public.memberships;
  v_target public.memberships;
  v_allowed text[] := array['berater', 'leader', 'admin', 'super_admin', 'developer'];
begin
  if not public.is_organization_admin() then
    raise exception 'AscendOS: Keine Berechtigung für diesen Bereich.' using errcode = '42501';
  end if;
  if v_org_id is null then
    raise exception 'AscendOS: Keine aktive Organisation.';
  end if;
  if p_role is null or not (p_role = any (v_allowed)) then
    raise exception 'AscendOS: Ungültige Rolle.';
  end if;

  select * into v_caller from public.memberships where id = public.active_membership_id();
  select * into v_target from public.memberships where id = p_membership_id;

  if v_target.id is null or v_target.org_id is distinct from v_org_id then
    raise exception 'AscendOS: Organisation oder Ressource nicht gefunden.';
  end if;

  -- Only membership super_admin may assign/remove super_admin or developer.
  if p_role in ('super_admin', 'developer') and v_caller.role is distinct from 'super_admin' then
    raise exception 'AscendOS: Keine Berechtigung für diesen Bereich.' using errcode = '42501';
  end if;
  if v_target.role in ('super_admin', 'developer')
     and p_role is distinct from v_target.role
     and v_caller.role is distinct from 'super_admin' then
    raise exception 'AscendOS: Keine Berechtigung für diesen Bereich.' using errcode = '42501';
  end if;

  -- Never invent platform_admins rows from org roles.
  update public.memberships
  set role = p_role
  where id = v_target.id
  returning * into v_target;

  insert into public.usage_events (user_id, org_id, event_type, metadata)
  values (
    auth.uid(),
    v_org_id,
    'org_admin_membership_role_changed',
    jsonb_build_object('membership_id', v_target.id, 'role', p_role)
  );

  return v_target;
end;
$$;

revoke all on function public.org_admin_set_membership_role(uuid, text) from public, anon;
grant execute on function public.org_admin_set_membership_role(uuid, text) to authenticated, service_role;

-- ---------- Membership status ----------
create or replace function public.org_admin_set_membership_status(
  p_membership_id uuid,
  p_status text
)
returns public.memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_target public.memberships;
  v_allowed text[] := array['active', 'suspended', 'ended'];
begin
  if not public.is_organization_admin() then
    raise exception 'AscendOS: Keine Berechtigung für diesen Bereich.' using errcode = '42501';
  end if;
  if v_org_id is null then
    raise exception 'AscendOS: Keine aktive Organisation.';
  end if;
  if p_status is null or not (p_status = any (v_allowed)) then
    raise exception 'AscendOS: Ungültiger Status.';
  end if;

  select * into v_target from public.memberships where id = p_membership_id;
  if v_target.id is null or v_target.org_id is distinct from v_org_id then
    raise exception 'AscendOS: Organisation oder Ressource nicht gefunden.';
  end if;

  if v_target.identity_id = auth.uid() and p_status is distinct from 'active' then
    raise exception 'AscendOS: Eigene Mitgliedschaft kann nicht deaktiviert werden.';
  end if;

  update public.memberships
  set status = p_status
  where id = v_target.id
  returning * into v_target;

  insert into public.usage_events (user_id, org_id, event_type, metadata)
  values (
    auth.uid(),
    v_org_id,
    'org_admin_membership_status_changed',
    jsonb_build_object('membership_id', v_target.id, 'status', p_status)
  );

  return v_target;
end;
$$;

revoke all on function public.org_admin_set_membership_status(uuid, text) from public, anon;
grant execute on function public.org_admin_set_membership_status(uuid, text) to authenticated, service_role;

-- ---------- Coach agent display/prompt patch (org-scoped) ----------
create or replace function public.org_admin_update_agent(
  p_agent_key text,
  p_name text default null,
  p_system_prompt text default null,
  p_is_active boolean default null
)
returns public.agents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.current_org_id();
  v_row public.agents;
begin
  if not public.is_organization_admin() then
    raise exception 'AscendOS: Keine Berechtigung für diesen Bereich.' using errcode = '42501';
  end if;
  if v_org_id is null then
    raise exception 'AscendOS: Keine aktive Organisation.';
  end if;

  update public.agents
  set
    name = coalesce(nullif(trim(p_name), ''), name),
    system_prompt = coalesce(p_system_prompt, system_prompt),
    is_active = coalesce(p_is_active, is_active)
  where org_id = v_org_id
    and key = p_agent_key
  returning * into v_row;

  if v_row.id is null then
    raise exception 'AscendOS: Organisation oder Ressource nicht gefunden.';
  end if;

  insert into public.usage_events (user_id, org_id, event_type, metadata)
  values (
    auth.uid(),
    v_org_id,
    'org_admin_agent_updated',
    jsonb_build_object('key', p_agent_key)
  );

  return v_row;
end;
$$;

revoke all on function public.org_admin_update_agent(text, text, text, boolean) from public, anon;
grant execute on function public.org_admin_update_agent(text, text, text, boolean) to authenticated, service_role;

comment on function public.org_admin_update_agent(text, text, text, boolean) is
  'Phase 9: update org-scoped agent persona fields. Never touches AI provider secrets.';
