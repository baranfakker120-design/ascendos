-- ============================================================
-- Corrective 53 (covers production gap from historical migration 30)
-- Frame cosmetics RPCs: ensure / list / equip
--
-- WHY NOT RE-RUN 20260817000030_sprint6_frame_display_contract.sql:
--   Original 30 also rewrites get_genealogy_tree, get_qualification_progress,
--   display_rank_for_ap (already present on production), and — critically —
--   ap_apply_to_total() with auto-equip behavior.
--   Auto-equip is OUT OF SCOPE and must not change without approval.
--
-- THIS MIGRATION (additive RPCs ONLY):
--   ensure_role_frame_cosmetics()
--   list_my_frame_cosmetics()
--   equip_frame_cosmetic(uuid)
--
-- Uses existing tables only: cosmetic_items, membership_cosmetics.
-- Auth: active_membership_id() only — no client-supplied membership_id.
-- Does NOT modify ap_apply_to_total().
-- ============================================================

create or replace function public.ensure_role_frame_cosmetics()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mid uuid := public.active_membership_id();
  v_org uuid;
  v_role text;
  v_asset text;
begin
  if auth.uid() is null or v_mid is null then
    return;
  end if;

  -- Bind to active membership only (no forged membership_id parameter).
  select m.org_id, m.role::text into v_org, v_role
  from public.memberships m
  where m.id = v_mid
    and m.identity_id = auth.uid()
    and m.status = 'active';
  if v_org is null then return; end if;

  if v_role = 'super_admin' then
    v_asset := 'frame-09';
  elsif v_role = 'developer' then
    v_asset := 'frame-08';
  else
    return;
  end if;

  insert into public.membership_cosmetics (membership_id, item_id, kind, is_equipped)
  select v_mid, ci.id, ci.kind, false
  from public.cosmetic_items ci
  where ci.org_id = v_org
    and ci.is_active
    and ci.kind = 'frame'
    and ci.asset_path = v_asset
  on conflict (membership_id, item_id) do nothing;
end;
$$;

comment on function public.ensure_role_frame_cosmetics() is
  'Corrective: unlock role special frames for the caller''s active membership only.';

revoke all on function public.ensure_role_frame_cosmetics() from public, anon;
grant execute on function public.ensure_role_frame_cosmetics() to authenticated, service_role;

create or replace function public.list_my_frame_cosmetics()
returns table (
  item_id uuid,
  asset_path text,
  label text,
  rank_key text,
  is_equipped boolean,
  unlocked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mid uuid := public.active_membership_id();
begin
  if auth.uid() is null or v_mid is null then
    return;
  end if;

  -- Confirm membership belongs to caller.
  if not exists (
    select 1 from public.memberships m
    where m.id = v_mid
      and m.identity_id = auth.uid()
      and m.status = 'active'
  ) then
    return;
  end if;

  perform public.ensure_role_frame_cosmetics();

  return query
  select
    ci.id,
    ci.asset_path,
    ci.label,
    ci.rank_key,
    mc.is_equipped,
    mc.unlocked_at
  from public.membership_cosmetics mc
  join public.cosmetic_items ci on ci.id = mc.item_id
  where mc.membership_id = v_mid
    and ci.kind = 'frame'
    and ci.is_active
  order by
    mc.is_equipped desc,
    coalesce((
      select r.threshold_ap from public.ranks r
      where r.org_id = ci.org_id and r.key = ci.rank_key
      limit 1
    ), 0) asc,
    ci.label;
end;
$$;

comment on function public.list_my_frame_cosmetics() is
  'Corrective: list frame cosmetics for the caller''s active membership only.';

revoke all on function public.list_my_frame_cosmetics() from public, anon;
grant execute on function public.list_my_frame_cosmetics() to authenticated, service_role;

create or replace function public.equip_frame_cosmetic(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mid uuid := public.active_membership_id();
begin
  if auth.uid() is null or v_mid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.id = v_mid
      and m.identity_id = auth.uid()
      and m.status = 'active'
  ) then
    raise exception 'not authenticated';
  end if;

  -- Own unlocked frame only (same membership + kind=frame). No cross-org.
  if not exists (
    select 1
    from public.membership_cosmetics mc
    join public.cosmetic_items ci on ci.id = mc.item_id
    join public.memberships m on m.id = mc.membership_id
    where mc.membership_id = v_mid
      and mc.item_id = p_item_id
      and mc.kind = 'frame'
      and ci.kind = 'frame'
      and ci.org_id = m.org_id
  ) then
    raise exception 'frame not unlocked';
  end if;

  update public.membership_cosmetics
  set is_equipped = false
  where membership_id = v_mid and kind = 'frame' and is_equipped;

  update public.membership_cosmetics
  set is_equipped = true
  where membership_id = v_mid and item_id = p_item_id;
end;
$$;

comment on function public.equip_frame_cosmetic(uuid) is
  'Corrective: equip an unlocked frame on the caller''s active membership only. No auto-equip.';

revoke all on function public.equip_frame_cosmetic(uuid) from public, anon;
grant execute on function public.equip_frame_cosmetic(uuid) to authenticated, service_role;
