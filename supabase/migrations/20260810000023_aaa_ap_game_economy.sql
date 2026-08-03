-- ============================================================
-- AAA Game Economy: automatische AP-Vergabe nach Design-Score
--
-- Spiegel von src/shared/lib/apScoring.ts
-- Dimensionen: Schwierigkeit, Dauer, Impact, Priorität, Seltenheit
-- → Reward-Tiers 10 / 25 / 50 / 75 / 100 / 150 / 250 / 500
-- ============================================================

-- 1) Pipeline-Regeln mit kalibrierten Werten füllen
update public.ap_rules r
set ap = v.ap,
    note = 'Auto-Score (Game Design): ' || v.et,
    updated_at = now()
from (values
  ('contact_created', 10),
  ('first_touch', 25),
  ('follow_up', 50),
  ('presentation_sent', 50),
  ('presentation_viewed', 75),
  ('fit_check_sent', 75),
  ('fit_check_completed', 150),
  ('waytomoon_sent', 75),
  ('three_way_call_done', 250),
  ('party_scheduled', 100),
  ('party_done', 250),
  ('became_customer', 250),
  ('registered', 500)
) as v(et, ap)
where r.source_kind = 'pipeline_event'
  and r.event_type = v.et
  and r.is_active;

-- 2) Usage-Regeln
update public.ap_rules r
set ap = v.ap,
    note = 'Auto-Score (Game Design): ' || v.et,
    updated_at = now()
from (values
  ('app_opened', 10),
  ('coach_message_sent', 25),
  ('contact_created', 10),
  ('journey_step_completed', 50),
  ('mission_skipped', 0),
  ('plan_committed', 25)
) as v(et, ap)
where r.source_kind = 'usage_event'
  and r.event_type = v.et
  and r.is_active;

-- 3) mission_completed Regel anlegen (Basis; Trigger überschreibt per Typ)
insert into public.ap_rules (org_id, source_kind, event_type, ap, note)
select o.id, 'usage_event', 'mission_completed', 50,
       'Auto-Score Basis; Delta folgt mission_type aus metadata'
from public.organizations o
where not exists (
  select 1 from public.ap_rules r
  where r.org_id = o.id
    and r.source_kind = 'usage_event'
    and r.event_type = 'mission_completed'
    and r.is_active
);

update public.ap_rules
set ap = 50,
    note = 'Auto-Score Basis; Delta folgt mission_type aus metadata',
    updated_at = now()
where source_kind = 'usage_event'
  and event_type = 'mission_completed'
  and is_active;

-- 4) Award-Trigger: mission_completed nach Mission-Typ bewerten
create or replace function public.ap_design_score_mission(p_mission_type text)
returns int
language sql
immutable
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
  'Game-Design AP für Missions-Typen — Spiegel von apScoring.ts scoreMission.';

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

  -- Missionen: Delta aus Game-Design-Score (nicht pauschal)
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
