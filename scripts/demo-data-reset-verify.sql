-- AscendOS demo-reset integrity checks (read-only)

-- 1) Active org tree
select
  p.first_name || ' ' || p.last_name as person,
  m.role,
  m.status,
  coalesce(sp.first_name || ' ' || sp.last_name, '— ROOT —') as sponsor,
  m.ap_total,
  m.streak_days,
  p.sponsor_id is not distinct from sm.identity_id as mirror_ok
from public.memberships m
join public.profiles p on p.id = m.identity_id
left join public.memberships sm on sm.id = m.sponsor_membership_id
left join public.profiles sp on sp.id = sm.identity_id
where m.org_id = '00000000-0000-0000-0000-000000000001'
  and m.status = 'active'
order by
  case when m.sponsor_membership_id is null then 0
       when sm.sponsor_membership_id is null then 1
       else 2 end,
  person;

-- 2) Ann-Christin gone
select count(*)::int as ann_christin_remaining
from public.profiles
where username = 'anniaydin'
   or (first_name ilike 'Ann-Christin%' and last_name ilike 'Aydin%');

-- 3) Content counters (expect 0)
select * from (
  select 'contacts' as entity, count(*)::int as n from public.contacts
  union all select 'coach_convos', count(*)::int from public.coach_convos
  union all select 'coach_messages', count(*)::int from public.coach_messages
  union all select 'pipeline_events', count(*)::int from public.pipeline_events
  union all select 'daily_plans', count(*)::int from public.daily_plans
  union all select 'daily_plan_items', count(*)::int from public.daily_plan_items
  union all select 'usage_events', count(*)::int from public.usage_events
  union all select 'ap_ledger', count(*)::int from public.ap_ledger
  union all select 'ap_task_completions', count(*)::int from public.ap_task_completions
  union all select 'monthly_awards', count(*)::int from public.monthly_awards
  union all select 'user_achievements', count(*)::int from public.user_achievements
  union all select 'user_progress', count(*)::int from public.user_progress
  union all select 'knowledge_gaps', count(*)::int from public.knowledge_gaps
  union all select 'invites', count(*)::int from public.invites
  union all select 'leadership_favorites', count(*)::int from public.leadership_favorites
  union all select 'leadership_notes', count(*)::int from public.leadership_notes
  union all select 'payouts', count(*)::int from public.payouts
  union all select 'kabelkatalog_state', count(*)::int from public.kabelkatalog_state
) c
order by entity;

-- 4) Orphan memberships (sponsor points to missing / inactive)
select count(*)::int as orphan_sponsor_links
from public.memberships m
left join public.memberships s on s.id = m.sponsor_membership_id
where m.status = 'active'
  and m.sponsor_membership_id is not null
  and (s.id is null or s.status is distinct from 'active');
