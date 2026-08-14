-- ============================================================
-- Phase 10 — Platform Admin: org lifecycle + platform RPCs
--
-- Hard rules:
--   - PLATFORM_SUPER_ADMIN only via platform_admins / is_platform_super_admin()
--   - Never treat memberships.role = super_admin as platform
--   - No hard delete of organizations
--   - No Team Seyda / Chogan / WayToMoon defaults for new orgs
--   - Repo only — do not apply to production without approval
-- ============================================================

-- ---------- organizations.status ----------
alter table public.organizations
  add column if not exists status text not null default 'active';

alter table public.organizations
  drop constraint if exists organizations_status_check;

alter table public.organizations
  add constraint organizations_status_check
  check (status in ('active', 'inactive'));

create index if not exists organizations_status_idx
  on public.organizations (status);

comment on column public.organizations.status is
  'Platform lifecycle: active | inactive. Deactivate ≠ delete. Org admins cannot change this.';

-- ---------- Protect status from org-admin updates ----------
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
  -- Only platform RPCs (security definer / bypass) should flip status.
  -- Direct client updates by org admins must not change status.
  if new.status is distinct from old.status
     and not public.is_platform_super_admin() then
    raise exception 'AscendOS: Keine Plattformberechtigung.';
  end if;
  return new;
end;
$$;

-- ---------- Platform can SELECT all organizations ----------
drop policy if exists organizations_select_platform on public.organizations;
create policy organizations_select_platform on public.organizations
  for select
  to authenticated
  using (public.is_platform_super_admin());

-- ---------- Inactive orgs: no normal active membership ----------
-- Preserve Fall 4: multiple active memberships without x-ascendos-org → NULL
-- (never guess via profiles.org_id mirror).
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
    join public.organizations o on o.id = m.org_id
    where m.identity_id = v_uid
      and m.org_id      = v_selektor
      and m.status      = 'active'
      and o.status      = 'active';
    return v_treffer;
  end if;

  select count(*) into v_anzahl
  from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.identity_id = v_uid
    and m.status = 'active'
    and o.status = 'active';

  if v_anzahl = 1 then
    select m.id into v_treffer
    from public.memberships m
    join public.organizations o on o.id = m.org_id
    where m.identity_id = v_uid
      and m.status = 'active'
      and o.status = 'active';
    return v_treffer;
  end if;

  -- Fall 4: zero or multiple active memberships in active orgs, no selector → reject.
  return null;
end;
$$;

comment on function public.active_membership_id() is
  'Validated active membership in an active organization. Selector preferred; single auto-resolves; multi without header returns null (Fall 4). Inactive orgs excluded.';

-- ---------- usage_events: platform audit types ----------
alter table public.usage_events drop constraint if exists usage_events_event_type_check;
alter table public.usage_events add constraint usage_events_event_type_check
  check (event_type in (
    'app_opened', 'plan_committed', 'mission_completed', 'mission_skipped',
    'coach_message_sent', 'contact_created', 'journey_step_completed',
    'org_admin_branding_updated',
    'org_admin_tool_upserted',
    'org_admin_membership_role_changed',
    'org_admin_membership_status_changed',
    'org_admin_agent_updated',
    'platform_organization_created',
    'platform_organization_deactivated',
    'platform_organization_reactivated',
    'platform_admin_added',
    'platform_admin_revoked',
    'platform_org_admin_invite_created'
  ));

-- ============================================================
-- RPCs
-- ============================================================

create or replace function public.platform_list_organizations()
returns table (
  id uuid,
  name text,
  display_name text,
  status text,
  created_at timestamptz,
  member_count bigint,
  team_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.name,
    coalesce(nullif(trim(o.branding->>'display_name'), ''), o.name) as display_name,
    o.status,
    o.created_at,
    (select count(*) from public.memberships m where m.org_id = o.id) as member_count,
    (select count(*) from public.teams t where t.org_id = o.id) as team_count
  from public.organizations o
  order by o.created_at desc;
end;
$$;

revoke all on function public.platform_list_organizations() from public, anon;
grant execute on function public.platform_list_organizations() to authenticated, service_role;

create or replace function public.platform_create_organization(
  p_name text,
  p_display_name text default null,
  p_website text default null,
  p_support_url text default null,
  p_logo_url text default null,
  p_admin_identity_id uuid default null
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_display text := trim(coalesce(nullif(p_display_name, ''), p_name, ''));
  v_org public.organizations;
  v_team_id uuid;
  v_branding jsonb;
begin
  if not public.is_platform_super_admin() then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;
  if length(v_name) < 2 then
    raise exception 'AscendOS: Organisationsname fehlt.' using errcode = '22023';
  end if;
  -- Never seed Org-1 brands onto new tenants.
  if v_display ~* '(team\s*seyda|waytomoon|essence\s*tribe)' then
    raise exception 'AscendOS: Ungültiger Anzeigename.';
  end if;

  v_branding := jsonb_build_object(
    'display_name', v_display
  );
  if nullif(trim(coalesce(p_website, '')), '') is not null then
    v_branding := v_branding || jsonb_build_object('website', trim(p_website));
  end if;
  if nullif(trim(coalesce(p_support_url, '')), '') is not null then
    v_branding := v_branding || jsonb_build_object('supportUrl', trim(p_support_url));
  end if;
  if nullif(trim(coalesce(p_logo_url, '')), '') is not null then
    v_branding := v_branding || jsonb_build_object('logoUrl', trim(p_logo_url));
  end if;

  insert into public.organizations (name, branding, settings, status)
  values (
    v_name,
    v_branding,
    jsonb_build_object('coach_daily_message_limit', 50, 'content_asset_limit', 25),
    'active'
  )
  returning * into v_org;

  insert into public.teams (org_id, name)
  values (v_org.id, 'Main Team')
  returning id into v_team_id;

  if p_admin_identity_id is not null then
    if not exists (select 1 from public.profiles where id = p_admin_identity_id) then
      raise exception 'AscendOS: Organisation oder Ressource nicht gefunden.';
    end if;
    insert into public.memberships (identity_id, org_id, team_id, role, status)
    values (p_admin_identity_id, v_org.id, v_team_id, 'super_admin', 'active');
  end if;

  insert into public.usage_events (user_id, org_id, event_type, metadata)
  values (
    auth.uid(),
    v_org.id,
    'platform_organization_created',
    jsonb_build_object('name', v_org.name, 'display_name', v_display)
  );

  return v_org;
end;
$$;

revoke all on function public.platform_create_organization(text, text, text, text, text, uuid) from public, anon;
grant execute on function public.platform_create_organization(text, text, text, text, text, uuid) to authenticated, service_role;

create or replace function public.platform_set_organization_status(
  p_org_id uuid,
  p_status text
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.organizations;
  v_event text;
begin
  if not public.is_platform_super_admin() then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'inactive') then
    raise exception 'AscendOS: Ungültiger Status.';
  end if;
  if p_org_id is null then
    raise exception 'AscendOS: Organisation oder Ressource nicht gefunden.';
  end if;

  update public.organizations
  set status = p_status
  where id = p_org_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'AscendOS: Organisation oder Ressource nicht gefunden.';
  end if;

  v_event := case
    when p_status = 'inactive' then 'platform_organization_deactivated'
    else 'platform_organization_reactivated'
  end;

  insert into public.usage_events (user_id, org_id, event_type, metadata)
  values (auth.uid(), v_row.id, v_event, jsonb_build_object('status', p_status));

  return v_row;
end;
$$;

revoke all on function public.platform_set_organization_status(uuid, text) from public, anon;
grant execute on function public.platform_set_organization_status(uuid, text) to authenticated, service_role;

create or replace function public.platform_create_org_admin_invite(
  p_org_id uuid,
  p_invite_role text default 'super_admin'
)
returns table (invite_code text, invite_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_code text;
  v_role text := coalesce(nullif(trim(p_invite_role), ''), 'super_admin');
begin
  if not public.is_platform_super_admin() then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;
  if p_org_id is null or not exists (select 1 from public.organizations where id = p_org_id) then
    raise exception 'AscendOS: Organisation oder Ressource nicht gefunden.';
  end if;
  if v_role not in ('super_admin', 'admin', 'leader', 'berater') then
    raise exception 'AscendOS: Ungültige Rolle.';
  end if;

  select t.id into v_team
  from public.teams t
  where t.org_id = p_org_id
  order by t.created_at
  limit 1;

  if v_team is null then
    insert into public.teams (org_id, name)
    values (p_org_id, 'Main Team')
    returning id into v_team;
  end if;

  v_code := upper(
    substring(replace(replace(replace(replace(
      encode(extensions.gen_random_bytes(8), 'base64'),
      '/', 'A'), '+', 'B'), '0', 'C'), 'O', 'D')
    from 1 for 10)
  );

  insert into public.invites (code, org_id, team_id, sponsor_id, role, created_by)
  values (v_code, p_org_id, v_team, auth.uid(), v_role, auth.uid());

  insert into public.usage_events (user_id, org_id, event_type, metadata)
  values (
    auth.uid(),
    p_org_id,
    'platform_org_admin_invite_created',
    jsonb_build_object('role', v_role, 'code', v_code)
  );

  return query
    select i.code, i.expires_at from public.invites i where i.code = v_code;
end;
$$;

revoke all on function public.platform_create_org_admin_invite(uuid, text) from public, anon;
grant execute on function public.platform_create_org_admin_invite(uuid, text) to authenticated, service_role;

create or replace function public.platform_list_platform_admins()
returns table (
  id uuid,
  identity_id uuid,
  is_active boolean,
  granted_at timestamptz,
  revoked_at timestamptz,
  notes text,
  first_name text,
  last_name text,
  username text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;

  return query
  select
    pa.id,
    pa.identity_id,
    pa.is_active,
    pa.granted_at,
    pa.revoked_at,
    pa.notes,
    p.first_name,
    p.last_name,
    p.username
  from public.platform_admins pa
  left join public.profiles p on p.id = pa.identity_id
  order by pa.granted_at desc;
end;
$$;

revoke all on function public.platform_list_platform_admins() from public, anon;
grant execute on function public.platform_list_platform_admins() to authenticated, service_role;

create or replace function public.platform_add_platform_admin(
  p_identity_id uuid,
  p_notes text default null
)
returns public.platform_admins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.platform_admins;
begin
  if not public.is_platform_super_admin() then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;
  if p_identity_id is null or not exists (select 1 from public.profiles where id = p_identity_id) then
    raise exception 'AscendOS: Organisation oder Ressource nicht gefunden.';
  end if;

  insert into public.platform_admins (identity_id, granted_by, notes, is_active, revoked_at)
  values (p_identity_id, auth.uid(), nullif(trim(coalesce(p_notes, '')), ''), true, null)
  on conflict (identity_id) do update
    set is_active = true,
        revoked_at = null,
        granted_by = auth.uid(),
        granted_at = now(),
        notes = coalesce(excluded.notes, public.platform_admins.notes)
  returning * into v_row;

  insert into public.usage_events (user_id, org_id, event_type, metadata)
  select auth.uid(), o.id, 'platform_admin_added',
         jsonb_build_object('identity_id', p_identity_id)
  from public.organizations o
  order by o.created_at
  limit 1;

  return v_row;
end;
$$;

revoke all on function public.platform_add_platform_admin(uuid, text) from public, anon;
grant execute on function public.platform_add_platform_admin(uuid, text) to authenticated, service_role;

create or replace function public.platform_revoke_platform_admin(
  p_identity_id uuid
)
returns public.platform_admins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active int;
  v_row public.platform_admins;
begin
  if not public.is_platform_super_admin() then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;

  select count(*) into v_active
  from public.platform_admins
  where is_active = true and revoked_at is null;

  if v_active <= 1
     and exists (
       select 1 from public.platform_admins
       where identity_id = p_identity_id
         and is_active = true
         and revoked_at is null
     ) then
    raise exception 'AscendOS: Letzter Platform Admin kann nicht entfernt werden.'
      using errcode = 'P0001';
  end if;

  update public.platform_admins
  set is_active = false,
      revoked_at = now()
  where identity_id = p_identity_id
    and is_active = true
  returning * into v_row;

  if v_row.id is null then
    raise exception 'AscendOS: Organisation oder Ressource nicht gefunden.';
  end if;

  insert into public.usage_events (user_id, org_id, event_type, metadata)
  select auth.uid(), o.id, 'platform_admin_revoked',
         jsonb_build_object('identity_id', p_identity_id)
  from public.organizations o
  order by o.created_at
  limit 1;

  return v_row;
end;
$$;

revoke all on function public.platform_revoke_platform_admin(uuid) from public, anon;
grant execute on function public.platform_revoke_platform_admin(uuid) to authenticated, service_role;

create or replace function public.platform_get_organization(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org public.organizations;
begin
  if not public.is_platform_super_admin() then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;

  select * into v_org from public.organizations where id = p_org_id;
  if v_org.id is null then
    raise exception 'AscendOS: Organisation oder Ressource nicht gefunden.';
  end if;

  return jsonb_build_object(
    'organization', to_jsonb(v_org),
    'display_name', coalesce(nullif(trim(v_org.branding->>'display_name'), ''), v_org.name),
    'status', v_org.status,
    'member_count', (select count(*) from public.memberships m where m.org_id = p_org_id),
    'team_count', (select count(*) from public.teams t where t.org_id = p_org_id),
    'tool_count', (select count(*) from public.external_tools et where et.org_id = p_org_id),
    'agent_count', (select count(*) from public.agents a where a.org_id = p_org_id),
    'knowledge_docs', (select count(*) from public.knowledge_docs kd where kd.org_id = p_org_id),
    'live_events', (select count(*) from public.live_coaching_events l where l.org_id = p_org_id),
    'stories', (select count(*) from public.ascend_stories s where s.org_id = p_org_id),
    'content_assets', (select count(*) from public.content_assets ca where ca.org_id = p_org_id),
    'instagram_connections', (
      select count(*) from public.content_instagram_connections c
      where c.org_id = p_org_id
    ),
    'usage_events', (select count(*) from public.usage_events u where u.org_id = p_org_id),
    'branding_configured', (
      coalesce(nullif(trim(v_org.branding->>'display_name'), ''), '') <> ''
      or coalesce(nullif(trim(v_org.branding->>'logoUrl'), ''), '') <> ''
    )
  );
end;
$$;

revoke all on function public.platform_get_organization(uuid) from public, anon;
grant execute on function public.platform_get_organization(uuid) to authenticated, service_role;

-- Aggregated usage overview (existing event types only; never secrets).
create or replace function public.platform_usage_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out jsonb;
begin
  if not public.is_platform_super_admin() then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_events', (select count(*) from public.usage_events),
    'coach_messages', (
      select count(*) from public.usage_events where event_type = 'coach_message_sent'
    ),
    'app_opens', (
      select count(*) from public.usage_events where event_type = 'app_opened'
    ),
    'plans_committed', (
      select count(*) from public.usage_events where event_type = 'plan_committed'
    ),
    'by_organization', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.event_count desc)
      from (
        select org_id, count(*)::bigint as event_count
        from public.usage_events
        group by org_id
      ) x
    ), '[]'::jsonb)
  )
  into v_out;

  return coalesce(v_out, '{}'::jsonb);
end;
$$;

revoke all on function public.platform_usage_overview() from public, anon;
grant execute on function public.platform_usage_overview() to authenticated, service_role;

-- Safe platform config metadata only (never secret values).
create or replace function public.platform_config_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_super_admin() then
    raise exception 'AscendOS: Keine Plattformberechtigung.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'supabase', 'connected',
    'ai_provider', 'configured',
    'instagram', 'configured',
    'push', 'configured',
    'billing', 'not_implemented'
  );
end;
$$;

revoke all on function public.platform_config_status() from public, anon;
grant execute on function public.platform_config_status() to authenticated, service_role;

comment on function public.platform_create_organization(text, text, text, text, text, uuid) is
  'Phase 10: create tenant org with neutral branding + Main Team. Platform only.';
comment on function public.platform_set_organization_status(uuid, text) is
  'Phase 10: activate/deactivate organization. Never deletes data.';
comment on function public.platform_config_status() is
  'Phase 10: metadata-only platform config. Never returns secrets.';
