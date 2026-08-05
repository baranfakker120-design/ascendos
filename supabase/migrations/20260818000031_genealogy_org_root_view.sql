-- ============================================================
-- Team tree: default root = highest org lineage root (not viewer)
--
-- Presentation-only change for /team:
--   get_genealogy_tree(null) walks up from the viewer to the
--   topmost sponsor in the org, then expands the full downline.
--   Every active org member sees the same org structure; edit
--   rights stay client-side (viewer + personal downline).
--
-- Explicit p_root_identity keeps the previous auth gate
-- (self / is_ancestor_of / super_admin) unchanged.
-- ============================================================

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

  if p_root_identity is null then
    -- Default Team view: climb to the highest visible org root, then expand.
    if v_viewer is null then
      select m.id into v_viewer
      from public.memberships m
      where m.identity_id = v_caller
        and m.org_id = v_org
        and m.status = 'active'
      limit 1;
    end if;

    if v_viewer is null then
      return;
    end if;

    with recursive upline as (
      select
        m.id as mid,
        m.identity_id as iid,
        m.sponsor_membership_id as sponsor_mid,
        0 as n
      from public.memberships m
      where m.id = v_viewer

      union all

      select
        p.id,
        p.identity_id,
        p.sponsor_membership_id,
        u.n + 1
      from public.memberships p
      join upline u on u.sponsor_mid = p.id
      where p.org_id = v_org
        and p.status = 'active'
        and u.n < 64
    )
    select mid, iid
      into v_root_membership, v_root_identity
    from upline
    order by n desc
    limit 1;
  else
    v_root_identity := p_root_identity;

    select m.id into v_root_membership
    from public.memberships m
    where m.identity_id = v_root_identity
      and m.org_id = v_org
      and m.status = 'active';

    if v_root_membership is null then
      return;
    end if;

    -- Explicit root: unchanged permission model (no upline forcing).
    if not (
      v_root_identity = v_caller
      or public.is_ancestor_of(v_root_identity)
      or public.is_super_admin()
    ) then
      return;
    end if;
  end if;

  if v_root_membership is null then
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

comment on function public.get_genealogy_tree(uuid) is
  'Org structure tree. null root = climb to lineage top then expand; '
  'explicit root keeps self/ancestor/super_admin gate.';
