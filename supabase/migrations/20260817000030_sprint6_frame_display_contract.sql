-- Sprint 6 / System 1 — Avatar & Frame display contract
-- 1) Qualification-aware display rank (Team Leader frame only when qualified)
-- 2) Berater-des-Monats flag = place 1 only (align genealogy with profile)
-- 3) Frame cosmetics: list / equip / ensure role specials
-- 4) Auto-equip newly unlocked AP frames when nothing equipped yet

-- ---------- Shared display rank (AP + TL qualification) ----------
create or replace function public.display_rank_for_ap(
  p_org uuid,
  p_ap int,
  p_team_leader_qualified boolean default false
)
returns table (
  key text,
  label text,
  threshold_ap int,
  frame_asset text,
  sort_order int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current record;
  v_tl_threshold int;
begin
  select rk.key, rk.label, rk.threshold_ap, rk.frame_asset, rk.sort_order
    into v_current
  from public.rank_for_ap(p_org, coalesce(p_ap, 0)) rk;

  if v_current.key = 'team_leader' and not coalesce(p_team_leader_qualified, false) then
    select r.key, r.label, r.threshold_ap, r.frame_asset, r.sort_order
      into v_current
    from public.ranks r
    where r.org_id = p_org
      and r.is_active
      and r.key is distinct from 'team_leader'
      and r.threshold_ap <= coalesce(p_ap, 0)
    order by r.threshold_ap desc
    limit 1;
  end if;

  select r.threshold_ap into v_tl_threshold
  from public.ranks r
  where r.org_id = p_org and r.key = 'team_leader' and r.is_active
  limit 1;

  if coalesce(p_team_leader_qualified, false)
     and v_tl_threshold is not null
     and (
       v_current.key is null
       or v_current.threshold_ap < v_tl_threshold
     )
  then
    select r.key, r.label, r.threshold_ap, r.frame_asset, r.sort_order
      into v_current
    from public.ranks r
    where r.org_id = p_org and r.key = 'team_leader' and r.is_active
    limit 1;
  end if;

  if v_current.key is null then
    return;
  end if;

  return query
  select
    v_current.key::text,
    v_current.label::text,
    v_current.threshold_ap::int,
    v_current.frame_asset::text,
    v_current.sort_order::int;
end;
$$;

comment on function public.display_rank_for_ap(uuid, int, boolean) is
  'Display rank/frame: Team Leader only when qualified; otherwise highest earned non-TL rank.';

revoke all on function public.display_rank_for_ap(uuid, int, boolean) from public, anon;
grant execute on function public.display_rank_for_ap(uuid, int, boolean) to authenticated, service_role;

-- ---------- Genealogy: place=1 Berater + display_rank_for_ap ----------
create or replace function public.get_genealogy_tree(p_root_identity uuid default null)
returns table (
  membership_id uuid,
  identity_id uuid,
  sponsor_membership_id uuid,
  depth int,
  first_name text,
  last_name text,
  username text,
  avatar_url text,
  phone text,
  role text,
  ap_total int,
  rank_key text,
  rank_label text,
  frame_asset text,
  direct_count int,
  team_count int,
  last_app_opened_at timestamptz,
  is_berater_des_monats boolean,
  joined_at timestamptz,
  icp_month int,
  streak_days int,
  is_favorite boolean,
  sponsor_name text,
  message_badge int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_org uuid := public.current_org_id();
  v_root_identity uuid;
  v_root_membership uuid;
  v_viewer uuid := public.active_membership_id();
  v_period date := date_trunc('month', now())::date;
  v_month_start timestamptz := date_trunc('month', now());
begin
  if v_caller is null or v_org is null then
    return;
  end if;

  v_root_identity := coalesce(p_root_identity, v_caller);

  select m.id into v_root_membership
  from public.memberships m
  where m.identity_id = v_root_identity
    and m.org_id = v_org
    and m.status = 'active';

  if v_root_membership is null then
    return;
  end if;

  if not (
    v_root_identity = v_caller
    or public.is_ancestor_of(v_root_identity)
    or public.is_super_admin()
  ) then
    return;
  end if;

  return query
  with recursive tree as (
    select
      m.id as mid,
      m.identity_id as iid,
      m.sponsor_membership_id as sponsor_mid,
      0 as lvl,
      array[m.id] as path
    from public.memberships m
    where m.id = v_root_membership

    union all

    select
      c.id,
      c.identity_id,
      c.sponsor_membership_id,
      t.lvl + 1,
      t.path || c.id
    from public.memberships c
    join tree t on c.sponsor_membership_id = t.mid
    where c.org_id = v_org
      and c.status = 'active'
      and not (c.id = any (t.path))
  )
  select
    t.mid,
    t.iid,
    t.sponsor_mid,
    t.lvl,
    coalesce(p.first_name, '')::text,
    coalesce(p.last_name, '')::text,
    coalesce(p.username, '')::text,
    p.avatar_url,
    p.phone,
    m.role::text,
    coalesce(m.ap_total, 0)::int,
    r.key::text,
    r.label::text,
    r.frame_asset::text,
    (
      select count(*)::int from tree d where d.sponsor_mid = t.mid
    ),
    (
      select count(*)::int
      from tree d
      where t.mid = any (d.path) and d.mid <> t.mid
    ),
    m.last_app_opened_at,
    exists (
      select 1
      from public.monthly_awards ma
      where ma.membership_id = t.mid
        and ma.period = v_period
        and ma.place = 1
    ),
    m.joined_at,
    coalesce((
      select sum(l.delta)::int
      from public.ap_ledger l
      where l.membership_id = t.mid
        and l.delta > 0
        and l.created_at >= v_month_start
    ), 0),
    coalesce(m.streak_days, 0)::int,
    exists (
      select 1 from public.leadership_favorites f
      where f.owner_membership_id = v_viewer
        and f.target_membership_id = t.mid
    ),
    nullif(trim(both from coalesce(sp.first_name,'') || ' ' || coalesce(sp.last_name,'')), ''),
    0::int
  from tree t
  join public.memberships m on m.id = t.mid
  left join public.profiles p on p.id = t.iid
  left join public.memberships sm on sm.id = t.sponsor_mid
  left join public.profiles sp on sp.id = sm.identity_id
  left join lateral (
    select d.key, d.label, d.frame_asset
    from public.display_rank_for_ap(
      v_org,
      coalesce(m.ap_total, 0),
      m.team_leader_qualified_at is not null
    ) d
  ) r on true
  order by
    exists (
      select 1 from public.leadership_favorites f
      where f.owner_membership_id = v_viewer and f.target_membership_id = t.mid
    ) desc,
    t.lvl,
    p.first_name,
    p.last_name;
end;
$$;

-- Keep qualification progress on the same contract
create or replace function public.get_qualification_progress(p_membership uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mid uuid := coalesce(p_membership, public.active_membership_id());
  v_org uuid;
  v_identity uuid;
  v_ap int;
  v_tl timestamptz;
  v_current record;
  v_next record;
  v_tl_progress record;
begin
  if auth.uid() is null or v_mid is null then
    return '{}'::jsonb;
  end if;

  select org_id, identity_id, ap_total, team_leader_qualified_at
    into v_org, v_identity, v_ap, v_tl
  from public.memberships where id = v_mid;

  if v_org is null then return '{}'::jsonb; end if;
  if not (
    v_identity = auth.uid() or public.is_ancestor_of(v_identity) or public.is_super_admin()
  ) then
    return '{}'::jsonb;
  end if;

  select * into v_current
  from public.display_rank_for_ap(v_org, coalesce(v_ap,0), v_tl is not null);

  select * into v_next from public.next_rank_for_ap(v_org, coalesce(v_ap,0));
  if v_next.key = 'team_leader' and v_tl is null then
    null;
  end if;

  select * into v_tl_progress from public.get_team_leader_progress(v_mid);

  return jsonb_build_object(
    'membership_id', v_mid,
    'ap_total', coalesce(v_ap,0),
    'current_rank', case when v_current.key is null then null else jsonb_build_object(
      'key', v_current.key, 'label', v_current.label,
      'threshold_ap', v_current.threshold_ap, 'frame_asset', v_current.frame_asset
    ) end,
    'next_rank', case when v_next.key is null then null else jsonb_build_object(
      'key', v_next.key, 'label', v_next.label, 'threshold_ap', v_next.threshold_ap,
      'remaining_ap', greatest(0, v_next.threshold_ap - coalesce(v_ap,0))
    ) end,
    'team_leader', jsonb_build_object(
      'qualified', coalesce(v_tl_progress.qualified, false),
      'active_firstlines', coalesce(v_tl_progress.active_firstlines, 0),
      'required_firstlines', coalesce(v_tl_progress.required_firstlines, 5),
      'bonus_amount_cents', coalesce(v_tl_progress.bonus_amount_cents, 10000),
      'bonus_paid', coalesce(v_tl_progress.bonus_paid, false),
      'qualified_at', v_tl_progress.qualified_at
    ),
    'unlocked_rewards', coalesce((
      select jsonb_agg(jsonb_build_object('kind', p.kind, 'amount_cents', p.amount_cents, 'note', p.note))
      from public.payouts p where p.identity_id = v_identity
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------- Frame cosmetics ----------
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

  select m.org_id, m.role::text into v_org, v_role
  from public.memberships m where m.id = v_mid;
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
    select 1 from public.membership_cosmetics mc
    where mc.membership_id = v_mid and mc.item_id = p_item_id and mc.kind = 'frame'
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

revoke all on function public.equip_frame_cosmetic(uuid) from public, anon;
grant execute on function public.equip_frame_cosmetic(uuid) to authenticated, service_role;

-- When AP unlocks a frame and nothing is equipped, equip the highest AP frame
create or replace function public.ap_apply_to_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total    integer;
  v_org      uuid;
  v_identity uuid;
  v_rank     record;
  v_had_equipped boolean;
  v_equip_item uuid;
begin
  update public.memberships
  set ap_total = ap_total + new.delta
  where id = new.membership_id
  returning ap_total, org_id, identity_id into v_total, v_org, v_identity;

  if v_org is null then return new; end if;

  select exists (
    select 1 from public.membership_cosmetics mc
    where mc.membership_id = new.membership_id and mc.kind = 'frame' and mc.is_equipped
  ) into v_had_equipped;

  insert into public.membership_cosmetics (membership_id, item_id, kind)
  select new.membership_id, ci.id, ci.kind
  from public.cosmetic_items ci
  join public.ranks r on r.org_id = ci.org_id and r.key = ci.rank_key
  where ci.org_id = v_org and ci.is_active
    and ci.rank_key is not null and r.is_active
    and r.threshold_ap <= v_total
    and ci.rank_key is distinct from 'team_leader'
  on conflict (membership_id, item_id) do nothing;

  if not v_had_equipped then
    select ci.id into v_equip_item
    from public.membership_cosmetics mc
    join public.cosmetic_items ci on ci.id = mc.item_id
    left join public.ranks r on r.org_id = ci.org_id and r.key = ci.rank_key
    where mc.membership_id = new.membership_id
      and ci.kind = 'frame'
      and ci.rank_key is distinct from 'team_leader'
    order by coalesce(r.threshold_ap, 0) desc
    limit 1;

    if v_equip_item is not null then
      update public.membership_cosmetics
      set is_equipped = false
      where membership_id = new.membership_id and kind = 'frame' and is_equipped;

      update public.membership_cosmetics
      set is_equipped = true
      where membership_id = new.membership_id and item_id = v_equip_item;
    end if;
  end if;

  for v_rank in
    select * from public.ranks
    where org_id = v_org and is_active
      and payout_cents is not null and threshold_ap <= v_total
      and key is distinct from 'team_leader'
  loop
    insert into public.payouts
      (identity_id, kind, amount_cents, awarded_for_membership_id, note)
    values (v_identity, v_rank.payout_kind, v_rank.payout_cents, new.membership_id,
            'Automatisch erkannt beim Erreichen von ' || v_rank.label)
    on conflict (identity_id, kind) do nothing;
  end loop;

  return new;
end;
$$;

