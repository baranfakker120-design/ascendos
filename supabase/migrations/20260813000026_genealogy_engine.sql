-- ============================================================
-- Migration 26: Genealogy Engine — tree payload + last seen
--
-- Sprint 4.1. get_downline returns (user_id, depth). Leaders need
-- one enriched, authorization-safe payload for the canvas.
-- Sidelines stay invisible: CTE is rooted in an authorized membership.
-- ============================================================

alter table public.memberships
  add column if not exists last_app_opened_at timestamptz;

comment on column public.memberships.last_app_opened_at is
  'Last app_opened usage_event for this membership (presence proxy).';

update public.memberships m
set last_app_opened_at = sub.mx
from (
  select ue.user_id, ue.org_id, max(ue.created_at) as mx
  from public.usage_events ue
  where ue.event_type = 'app_opened'
  group by ue.user_id, ue.org_id
) sub
where m.identity_id = sub.user_id
  and m.org_id = sub.org_id
  and m.last_app_opened_at is null;

create or replace function public.sync_membership_last_app_opened()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_type is distinct from 'app_opened' then
    return new;
  end if;

  update public.memberships
  set last_app_opened_at = greatest(
    coalesce(last_app_opened_at, new.created_at),
    new.created_at
  )
  where identity_id = new.user_id
    and org_id = new.org_id
    and status = 'active';

  return new;
end;
$$;

drop trigger if exists usage_events_sync_last_app_opened on public.usage_events;
create trigger usage_events_sync_last_app_opened
  after insert on public.usage_events
  for each row execute function public.sync_membership_last_app_opened();

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
  joined_at timestamptz
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
  v_period date := date_trunc('month', now())::date;
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
    ),
    m.joined_at
  from tree t
  join public.memberships m on m.id = t.mid
  left join public.profiles p on p.id = t.iid
  left join lateral (
    select rk.key, rk.label, rk.frame_asset
    from public.rank_for_ap(v_org, coalesce(m.ap_total, 0)) rk
  ) r on true
  order by t.lvl, p.first_name, p.last_name;
end;
$$;

comment on function public.get_genealogy_tree(uuid) is
  'Enriched genealogy tree for the active org. Root defaults to caller. Auth matches get_downline.';

revoke all on function public.get_genealogy_tree(uuid) from public, anon;
grant execute on function public.get_genealogy_tree(uuid) to authenticated, service_role;
