-- ============================================================
-- Migration 25: Restore F2 Fall 4 — never guess the active org
--
-- Migration 20 added a profiles.org_id mirror fallback when an
-- identity has multiple active memberships and no x-ascendos-org
-- header. That contradicts F2 Teil 1.3 Fall 4 (ABWEISEN, nicht
-- raten) and the pgTAP suite that encodes it.
--
-- Single-membership auto-resolve (Fall 3) and the explicit
-- selector (Fall 1/2) stay unchanged. The frontend always sets
-- x-ascendos-org after AuthProvider resolves the active org.
-- ============================================================

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

  -- Fall 4: multiple active memberships, no selector → reject.
  return null;
end;
$$;

comment on function public.active_membership_id() is
  'Validated active membership. Selector x-ascendos-org preferred; single active membership auto-resolves; multi without header returns null (F2 Fall 4).';

-- System pipeline events (source = system) may have no acting user.
-- log_contact_created always sets owner_id; other system writers may omit it.
-- AP award treats a null created_by as "no membership to credit".
alter table public.pipeline_events
  alter column created_by drop not null;

-- AAA mission scorer was introduced without a pinned search_path (F1).
create or replace function public.ap_design_score_mission(p_mission_type text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_mission_type
    when 'new_contacts' then 25
    when 'follow_up_overdue' then 50
    when 'reactivate_contact' then 50
    when 'presentation_pending' then 75
    when 'next_step_due' then 50
    when 'fit_check_next_step' then 100
    else 50
  end;
$$;

-- ============================================================
-- Gamification table privileges (Sprint 4 intent)
--
-- Migration 13 sets default ALL on future tables for anon and
-- authenticated. Migration 18 then granted SELECT (+ limited UPDATE)
-- but never revoked the inherited ALL. Result:
--   - UPDATE ap_rules as berater updates 0 rows (RLS) with no error
--     instead of 42501 (M8)
--   - authenticated still has INSERT on ap_ledger (O5)
--   - anon still has SELECT on payouts (O6)
--
-- RLS remains the row boundary; table privileges match the
-- documented write surface: service_role writes catalogs/ledger;
-- authenticated reads; limited UPDATE only where policies allow.
-- ============================================================

revoke all on table
  public.seasons,
  public.ap_rules,
  public.ranks,
  public.cosmetic_items,
  public.ap_ledger,
  public.membership_cosmetics,
  public.payouts,
  public.monthly_awards
from anon, authenticated;

grant select on
  public.seasons,
  public.ap_rules,
  public.ranks,
  public.cosmetic_items,
  public.ap_ledger,
  public.membership_cosmetics,
  public.payouts,
  public.monthly_awards
to authenticated;

grant update on public.membership_cosmetics to authenticated;
grant update on public.payouts to authenticated;

grant all on
  public.seasons,
  public.ap_rules,
  public.ranks,
  public.cosmetic_items,
  public.ap_ledger,
  public.membership_cosmetics,
  public.payouts,
  public.monthly_awards
to service_role;
