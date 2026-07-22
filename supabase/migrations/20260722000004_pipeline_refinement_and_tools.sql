-- ============================================================
-- Migration 4 (Sprint 2): Pipeline-Verfeinerung & externe Tools
-- 1. 3-Way-Call wird eigene Phase (zwischen Fit Check und Partner)
-- 2. Neue Event-Typen: fit_check_sent, waytomoon_sent
-- 3. external_tools: WayToMoon, Präsentation, Fit Check als Daten
--    (ADR-003: additive Migration, kein Bestandsdaten-Umbau —
--    Phasen aller existierenden Kontakte berechnen sich neu.)
-- ============================================================

-- ---------- 1. Event-Typen erweitern ----------

alter table public.pipeline_events
  drop constraint pipeline_events_event_type_check;

alter table public.pipeline_events
  add constraint pipeline_events_event_type_check check (event_type in (
    'contact_created',
    'first_touch',
    'follow_up',
    'presentation_sent',
    'presentation_viewed',
    'fit_check_sent',
    'fit_check_completed',
    'waytomoon_sent',
    'three_way_call_done',
    'party_scheduled',
    'party_done',
    'became_customer',
    'registered'
  ));

-- ---------- 2. Phasen-Ranking: 3-Way-Call als Stufe ----------
-- Leiter: lead -> im_gespraech -> praesentation_offen -> praesentation
--         -> fit_check -> three_way_call -> kunde -> partner
-- (fit_check_sent / waytomoon_sent haben Rang 0: sie dokumentieren,
--  ändern aber die Phase nicht — erst das Ergebnis tut das.)

create or replace function public.event_phase_rank(p_event_type text)
returns int
language sql
immutable
as $$
  select case p_event_type
    when 'registered'          then 70
    when 'became_customer'     then 60
    when 'three_way_call_done' then 50
    when 'fit_check_completed' then 40
    when 'presentation_viewed' then 30
    when 'presentation_sent'   then 20
    when 'first_touch'         then 10
    else 0
  end;
$$;

create or replace view public.contact_phases
with (security_invoker = true)
as
select
  c.id as contact_id,
  c.owner_id,
  case max(public.event_phase_rank(e.event_type))
    when 70 then 'partner'
    when 60 then 'kunde'
    when 50 then 'three_way_call'
    when 40 then 'fit_check'
    when 30 then 'praesentation'
    when 20 then 'praesentation_offen'
    when 10 then 'im_gespraech'
    else 'lead'
  end as phase,
  max(e.occurred_at) as last_event_at
from public.contacts c
left join public.pipeline_events e on e.contact_id = c.id
group by c.id, c.owner_id;

-- ---------- 3. Externe Tools als konfigurierte Ressourcen ----------
-- Die drei Alt-Anwendungen (Generation 1) stehen als Datensätze in
-- der DB, nie im Code. Bei späterer nativer Integration werden sie
-- deaktiviert und das native Modul schreibt dieselben Events mit
-- anderer source — Konsumenten bleiben unverändert (Phase 2 / ADR-003).

create table public.external_tools (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  key                text not null,
  name               text not null,
  description        text,
  url                text not null,
  -- Event, das beim Teilen des Links gesetzt wird:
  share_event_type   text not null,
  -- Event, das der Berater nach Rückmeldung manuell setzt:
  result_event_type  text,
  sort_order         int not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (org_id, key)
);

alter table public.external_tools enable row level security;

create policy external_tools_select_member on public.external_tools
  for select using (org_id = public.current_org_id() and is_active);

create policy external_tools_admin_insert on public.external_tools
  for insert with check (public.is_super_admin() and org_id = public.current_org_id());

create policy external_tools_admin_update on public.external_tools
  for update using (public.is_super_admin() and org_id = public.current_org_id());
