-- ============================================================
-- Corrective 52 (covers production gap from historical migration 23)
-- AP Design Score: mission_completed scoring
--
-- WHY NOT RE-RUN 20260810000023_aaa_ap_game_economy.sql:
--   Original 23 also UPDATEs ap_rules economy values (pipeline/usage
--   AP amounts). Production Org#1 rules are currently at AP=0 and must
--   NOT change without separate human economy approval.
--
-- THIS MIGRATION (additive functions ONLY):
--   1) ap_design_score_mission(text) — IMMUTABLE, mirrors apScoring.ts
--   2) ap_award_from_event() — supports mission_completed via metadata
--      while preserving pipeline/usage/correction behavior
--
-- OUT OF SCOPE (documented; NOT applied here):
--   -- OPTIONAL ECONOMY (requires separate Human Approval):
--   -- UPDATE public.ap_rules SET ap = … for pipeline/usage events
--   -- INSERT mission_completed base rule / SET ap = 50
--   -- See original migration 23 sections 1–3.
--
-- Does NOT: mutate ledger rows, ranks, memberships AP totals, or rules.
-- ============================================================

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

comment on function public.ap_design_score_mission(text) is
  'Corrective: Game-Design AP for mission types — mirror of apScoring.ts scoreMission. No ap_rules economy writes.';

revoke all on function public.ap_design_score_mission(text) from public, anon;
grant execute on function public.ap_design_score_mission(text) to authenticated, service_role;

-- Award trigger: keep existing event paths; add mission_completed override.
create or replace function public.ap_award_from_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identity    uuid;
  v_org         uuid;
  v_event_type  text;
  v_source_kind text;
  v_membership  uuid;
  v_rule        public.ap_rules;
  v_orig_type   text;
  v_delta       int;
  v_mission     text;
  v_meta        jsonb;
begin
  if TG_TABLE_NAME = 'pipeline_events' then
    v_identity := new.created_by; v_org := new.org_id;
    v_event_type := new.event_type; v_source_kind := 'pipeline_event';
    v_meta := coalesce(new.payload, '{}'::jsonb);
  elsif TG_TABLE_NAME = 'usage_events' then
    v_identity := new.user_id; v_org := new.org_id;
    v_event_type := new.event_type; v_source_kind := 'usage_event';
    v_meta := coalesce(new.metadata, '{}'::jsonb);
  else
    return new;
  end if;

  if v_identity is null or v_org is null then return new; end if;

  select m.id into v_membership
  from public.memberships m
  where m.identity_id = v_identity and m.org_id = v_org and m.status = 'active';

  if v_membership is null then return new; end if;

  -- Korrektur: Gegenbuchung
  if v_source_kind = 'pipeline_event' and v_event_type = 'correction' then
    v_orig_type := new.payload ->> 'corrected_event_type';
    if v_orig_type is null then return new; end if;

    select * into v_rule from public.ap_rules r
    where r.org_id = v_org and r.source_kind = 'pipeline_event'
      and r.event_type = v_orig_type and r.is_active
      and r.valid_from <= now()
      and (r.valid_until is null or r.valid_until > now())
    limit 1;

    if v_rule.id is null or v_rule.ap = 0 then return new; end if;

    insert into public.ap_ledger
      (membership_id, delta, reason, rule_id, source_kind, source_event_id, season_id)
    values (v_membership, -v_rule.ap, 'Korrektur: ' || v_orig_type,
            v_rule.id, 'correction', new.id, v_rule.season_id)
    on conflict do nothing;
    return new;
  end if;

  select * into v_rule from public.ap_rules r
  where r.org_id = v_org and r.source_kind = v_source_kind
    and r.event_type = v_event_type and r.is_active
    and r.valid_from <= now()
    and (r.valid_until is null or r.valid_until > now())
  limit 1;

  if v_rule.id is null then return new; end if;

  v_delta := v_rule.ap;

  -- Missionen: Delta aus Game-Design-Score (nicht pauschal aus Regel)
  if v_source_kind = 'usage_event' and v_event_type = 'mission_completed' then
    v_mission := v_meta ->> 'mission_type';
    if v_mission is not null then
      v_delta := public.ap_design_score_mission(v_mission);
    end if;
  end if;

  if v_delta = 0 then return new; end if;

  insert into public.ap_ledger
    (membership_id, delta, reason, rule_id, source_kind, source_event_id, season_id)
  values (v_membership, v_delta, v_event_type,
          v_rule.id, v_source_kind, new.id, v_rule.season_id)
  on conflict do nothing;

  return new;
end;
$$;

comment on function public.ap_award_from_event() is
  'Corrective: AP award from pipeline/usage events; mission_completed uses ap_design_score_mission. Does not mutate ap_rules.';
