-- ============================================================
-- Migration 3: CRM-Kern
-- contacts + pipeline_events (Event-Modell statt Statusfeld, ADR-003)
-- Kontaktdaten sind strikt privat: Owner-only, auch für Leader
-- und Admins (Produktentscheidung Phase 4, DSGVO/ADR-020).
-- ============================================================

create table public.contacts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  phone       text,
  email       text,
  notes       text,
  next_step   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index contacts_owner_id_idx on public.contacts (owner_id);
create index contacts_org_id_idx   on public.contacts (org_id);

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- Event-Typen des Vertriebsprozesses. Bewusst als CHECK statt ENUM:
-- neue Typen sind eine einfache additive Migration, kein Typ-Umbau.
create table public.pipeline_events (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  event_type  text not null check (event_type in (
                'contact_created',
                'first_touch',
                'follow_up',
                'presentation_sent',
                'presentation_viewed',
                'fit_check_completed',
                'three_way_call_done',
                'party_scheduled',
                'party_done',
                'became_customer',
                'registered'
              )),
  source      text not null default 'manual'
              check (source in ('manual', 'waytomoon', 'presentation', 'fitcheck', 'system')),
  payload     jsonb not null default '{}'::jsonb,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index pipeline_events_contact_idx
  on public.pipeline_events (contact_id, occurred_at desc);
create index pipeline_events_created_by_idx
  on public.pipeline_events (created_by, occurred_at desc);

-- Jeder neue Kontakt bekommt automatisch sein Entstehungs-Event —
-- die Historie ist damit ab Sekunde eins lückenlos.
create or replace function public.log_contact_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pipeline_events (contact_id, org_id, event_type, source, created_by)
  values (new.id, new.org_id, 'contact_created', 'system', new.owner_id);
  return new;
end;
$$;

create trigger contacts_log_created
  after insert on public.contacts
  for each row execute function public.log_contact_created();

-- ---------- Phasen-Ableitung ----------
-- Die Phase ist eine abgeleitete Sicht über Events, nie ein Feld
-- (ADR-003). Rangfolge = am weitesten fortgeschrittenes Event.

create or replace function public.event_phase_rank(p_event_type text)
returns int
language sql
immutable
as $$
  select case p_event_type
    when 'registered'          then 60
    when 'became_customer'     then 50
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
    when 60 then 'partner'
    when 50 then 'kunde'
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

-- ---------- Row Level Security ----------

alter table public.contacts        enable row level security;
alter table public.pipeline_events enable row level security;

-- contacts: ausschließlich der Owner. Keine Leader-, keine Admin-Policy —
-- der Warm Market eines Beraters gehört ihm.
create policy contacts_owner_all on public.contacts
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and org_id = public.current_org_id());

-- pipeline_events: sichtbar/erstellbar nur für den Owner des Kontakts.
-- Events sind unveränderlich (kein UPDATE/DELETE-Policy): Historie
-- wird nie umgeschrieben; Korrekturen sind neue Events.
create policy pipeline_events_select_owner on public.pipeline_events
  for select using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_id and c.owner_id = auth.uid()
    )
  );

create policy pipeline_events_insert_owner on public.pipeline_events
  for insert with check (
    created_by = auth.uid()
    and org_id = public.current_org_id()
    and exists (
      select 1 from public.contacts c
      where c.id = contact_id and c.owner_id = auth.uid()
    )
  );
