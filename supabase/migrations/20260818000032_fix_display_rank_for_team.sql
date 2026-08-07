-- ============================================================
-- Hotfix: Team tree depends on display_rank_for_ap
--
-- Migration 31 (org-root genealogy) copied the Sprint-6 genealogy
-- body which calls display_rank_for_ap. That helper was never
-- applied on some live projects, so /team failed with:
--   function public.display_rank_for_ap(uuid, integer, boolean)
--   does not exist
--
-- Idempotent: create or replace the shared display-rank helper.
-- ============================================================

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
  if auth.uid() is not null then
    if p_org is distinct from public.current_org_id()
       and not public.is_super_admin() then
      raise exception 'AscendOS: display_rank_for_ap org mismatch';
    end if;
  end if;

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
