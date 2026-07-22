-- Beta-Auswertung (ADR-016) — die drei Kernfragen als SQL.
-- Ausführen in Studio (Staging/Production) als Admin.

-- Frage 1: Öffnen die Nutzer AscendOS regelmäßig?
-- [N-2] Nenner = ALLE Berater/Leader der Org (nicht nur Nutzer mit
-- Aktivität) — wer die App nie öffnet, ist die wichtigste Zahl.
with days as (
  select user_id, count(distinct date_trunc('day', created_at)) as active_days
  from usage_events
  where event_type = 'app_opened' and created_at >= now() - interval '7 days'
  group by user_id
)
select
  count(*) filter (where d.active_days >= 4)  as regelmaessige_nutzer,
  count(*) filter (where d.user_id is null)   as nie_geoeffnet,
  count(*)                                    as alle_nutzer,
  round(100.0 * count(*) filter (where d.active_days >= 4)
        / greatest(count(*), 1), 1)           as prozent_regelmaessig
from profiles p
left join days d on d.user_id = p.id
where p.role <> 'super_admin';

-- Frage 2: Hilft das Daily Command Center beim Handeln?
-- Commit-Quote und Missions-Abschlussquote pro Tag (letzte 14 Tage):
select
  date_trunc('day', created_at)::date as tag,
  count(*) filter (where event_type = 'plan_committed')   as plaene_committed,
  count(*) filter (where event_type = 'mission_completed') as missionen_erledigt,
  count(*) filter (where event_type = 'mission_skipped')   as missionen_uebersprungen
from usage_events
where created_at >= now() - interval '14 days'
group by 1 order by 1 desc;

-- Frage 3: Wird der Coach genutzt und trifft er die Wissensbasis?
select
  date_trunc('week', created_at)::date as woche,
  count(*) as coach_nachrichten,
  count(distinct user_id) as aktive_coach_nutzer,
  round(100.0 * count(*) filter (where (metadata ->> 'had_knowledge')::boolean)
        / greatest(count(*), 1), 1) as prozent_mit_teamwissen
from usage_events
where event_type = 'coach_message_sent'
group by 1 order by 1 desc;
