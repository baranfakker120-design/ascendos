-- ============================================================
-- Sprint 6 System 3 — Recognition Cinema (HeroScreen)
--
-- Product definition (Sprint 4 + audit): there is no separate
-- "AAA Cinema" product. The planned recognition cinema is:
--   1) RankUpOverlay (AP ranks) — shipped System 1
--   2) HeroScreen — Berater des Monats podium (places 1–3)
--
-- This migration adds usage_events.hero_seen so "seen this title
-- month" persists across devices (metadata.period = YYYY-MM-01).
-- ============================================================

alter table public.usage_events
  drop constraint if exists usage_events_event_type_check;

alter table public.usage_events
  add constraint usage_events_event_type_check
  check (event_type in (
    'app_opened',
    'plan_committed',
    'mission_completed',
    'mission_skipped',
    'coach_message_sent',
    'contact_created',
    'journey_step_completed',
    'hero_seen'
  ));

comment on constraint usage_events_event_type_check on public.usage_events is
  'Includes hero_seen for Advisor HeroScreen (title-month acknowledgement).';

create or replace function public.has_seen_advisor_hero(p_period date)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_period date := (date_trunc('month', coalesce(p_period, timezone('utc', now())::date)::timestamp))::date;
begin
  if auth.uid() is null then
    return true;
  end if;
  return exists (
    select 1
    from public.usage_events ue
    where ue.user_id = auth.uid()
      and ue.event_type = 'hero_seen'
      and (ue.metadata->>'period') = v_period::text
  );
end;
$$;

revoke all on function public.has_seen_advisor_hero(date) from public, anon;
grant execute on function public.has_seen_advisor_hero(date) to authenticated, service_role;

create or replace function public.mark_advisor_hero_seen(p_period date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := (date_trunc('month', coalesce(p_period, timezone('utc', now())::date)::timestamp))::date;
  v_org uuid := public.current_org_id();
begin
  if auth.uid() is null or v_org is null then
    return;
  end if;
  if public.has_seen_advisor_hero(v_period) then
    return;
  end if;
  insert into public.usage_events (user_id, org_id, event_type, metadata)
  values (
    auth.uid(),
    v_org,
    'hero_seen',
    jsonb_build_object('period', v_period::text, 'kind', 'advisor_hero')
  );
end;
$$;

revoke all on function public.mark_advisor_hero_seen(date) from public, anon;
grant execute on function public.mark_advisor_hero_seen(date) to authenticated, service_role;
