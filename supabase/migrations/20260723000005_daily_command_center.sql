-- ============================================================
-- Migration 5 (Sprint 3): Daily Command Center
-- Regel-Engine in Postgres (ADR-006, ADR-013): deterministisch,
-- idempotent, ohne LLM. daily_plan_items als Tabelle (ADR-017).
-- ============================================================

-- Terminierbare nächste Schritte (Signal "Terminierte Aufgaben"):
alter table public.contacts add column next_step_due date;

create table public.daily_plans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  plan_date    date not null,
  committed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, plan_date)
);

create table public.daily_plan_items (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.daily_plans(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete cascade,
  mission_type  text not null check (mission_type in (
                  'fit_check_next_step',   -- Fit Check da, 3-Way-Call fehlt
                  'next_step_due',         -- terminierter Schritt fällig
                  'presentation_pending',  -- gesendet, nicht angesehen
                  'follow_up_overdue',     -- 7+ Tage kein Kontakt
                  'reactivate_contact',    -- 14+ Tage keine Aktivität
                  'new_contacts'           -- Pipeline-Aufbau (ohne Kontaktbezug)
                )),
  title         text not null,
  reason        text not null,
  score         int not null,
  position      int not null,
  status        text not null default 'pending'
                check (status in ('pending', 'done', 'deferred', 'skipped')),
  status_reason text,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index daily_plans_user_date_idx on public.daily_plans (user_id, plan_date desc);
create index daily_plan_items_plan_idx on public.daily_plan_items (plan_id, position);

-- ============================================================
-- Regel-Engine: Kandidaten sammeln, bewerten, Top-Missionen anlegen.
-- Idempotent: existiert für (user, datum) ein Plan, wird er zurückgegeben.
-- Scores (je näher am Abschluss, desto höher; ADR-006):
--   fit_check_next_step   100
--   next_step_due          90 (+5 wenn überfällig)
--   presentation_pending   80 (ab 2 Tagen nach Versand)
--   follow_up_overdue      60 + Tage (max 75)
--   reactivate_contact     50
--   new_contacts           30 (nur wenn < 3 echte Kandidaten)
-- Pro Kontakt maximal eine Mission (die höchstbewertete).
-- p_date kommt vom Client: das lokale Datum des Nutzers, damit
-- "heute" in seiner Zeitzone gilt, nicht in UTC.
-- ============================================================

create or replace function public.generate_daily_plan(p_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_org     uuid;
  v_plan_id uuid;
  v_count   int;
begin
  select org_id into v_org from public.profiles where id = v_user;
  if v_org is null then
    raise exception 'AscendOS: Kein Profil gefunden.';
  end if;

  select id into v_plan_id
  from public.daily_plans
  where user_id = v_user and plan_date = p_date;
  if v_plan_id is not null then
    return v_plan_id;
  end if;

  insert into public.daily_plans (user_id, org_id, plan_date)
  values (v_user, v_org, p_date)
  returning id into v_plan_id;

  -- Kandidaten aus Kontakten + Event-Historie (explizit auf den
  -- Nutzer gefiltert — die Funktion läuft als Owner an RLS vorbei).
  with contact_state as (
    select
      c.id,
      c.name,
      c.next_step,
      c.next_step_due,
      max(public.event_phase_rank(e.event_type)) as max_rank,
      max(e.occurred_at) as last_event_at,
      max(e.occurred_at) filter (where e.event_type = 'presentation_sent')
        as presentation_sent_at,
      bool_or(e.event_type = 'presentation_viewed') as presentation_viewed,
      bool_or(e.event_type = 'fit_check_completed') as fit_check_done,
      bool_or(e.event_type = 'three_way_call_done') as three_way_done
    from public.contacts c
    left join public.pipeline_events e on e.contact_id = c.id
    where c.owner_id = v_user
    group by c.id
  ),
  candidates as (
    -- Fit Check abgeschlossen, 3-Way-Call fehlt: heißester Kandidat.
    select id as contact_id, 'fit_check_next_step' as mission_type,
      '3-Way-Call mit ' || name || ' organisieren' as title,
      'Fit Check ist abgeschlossen — jetzt entscheidet der nächste Schritt.' as reason,
      100 as score
    from contact_state
    where fit_check_done and not three_way_done and max_rank < 60

    union all
    -- Terminierter nächster Schritt heute fällig oder überfällig.
    select id, 'next_step_due',
      coalesce(next_step, 'Geplanten Schritt bei ' || name || ' erledigen'),
      case when next_step_due < p_date
        then 'Bei ' || name || ' seit ' || (p_date - next_step_due) || ' Tag(en) überfällig.'
        else 'Für heute bei ' || name || ' geplant.'
      end,
      case when next_step_due < p_date then 95 else 90 end
    from contact_state
    where next_step_due is not null and next_step_due <= p_date and max_rank < 70

    union all
    -- Präsentation gesendet, seit 2+ Tagen nicht angesehen: nachfassen.
    select id, 'presentation_pending',
      'Bei ' || name || ' zur Präsentation nachfassen',
      'Präsentation vor ' || extract(day from now() - presentation_sent_at)::int ||
        ' Tagen gesendet, noch nicht angesehen.',
      80
    from contact_state
    where presentation_sent_at is not null
      and not presentation_viewed
      and presentation_sent_at < now() - interval '2 days'
      and max_rank < 60

    union all
    -- 7+ Tage kein Kontakt (aktive Pipeline, noch kein Kunde/Partner).
    select id, 'follow_up_overdue',
      name || ' kontaktieren',
      'Seit ' || extract(day from now() - last_event_at)::int ||
        ' Tagen kein Kontakt — bleib präsent.',
      least(60 + extract(day from now() - last_event_at)::int, 75)
    from contact_state
    where last_event_at < now() - interval '7 days'
      and last_event_at >= now() - interval '14 days'
      and max_rank between 10 and 50

    union all
    -- 14+ Tage keinerlei Aktivität: reaktivieren.
    select id, 'reactivate_contact',
      name || ' reaktivieren',
      'Seit ' || extract(day from now() - last_event_at)::int ||
        ' Tagen keine Aktivität — ein kurzes Lebenszeichen genügt.',
      50
    from contact_state
    where last_event_at < now() - interval '14 days'
      and max_rank < 60
  ),
  best_per_contact as (
    select distinct on (contact_id) *
    from candidates
    order by contact_id, score desc
  )
  insert into public.daily_plan_items
    (plan_id, contact_id, mission_type, title, reason, score, position)
  select v_plan_id, contact_id, mission_type, title, reason, score,
         row_number() over (order by score desc, title)
  from best_per_contact
  order by score desc, title
  limit 5;

  -- Weniger als 3 echte Missionen: Pipeline-Aufbau ergänzen. Bewusst
  -- nur eine ehrliche Auffüll-Mission — wir erfinden keine Dringlichkeit.
  select count(*) into v_count
  from public.daily_plan_items where plan_id = v_plan_id;

  if v_count < 3 then
    insert into public.daily_plan_items
      (plan_id, contact_id, mission_type, title, reason, score, position)
    values (v_plan_id, null, 'new_contacts',
      'Drei neue Menschen ansprechen',
      'Frische Kontakte sind der Treibstoff deiner Pipeline.',
      30, v_count + 1);
  end if;

  return v_plan_id;
end;
$$;

-- ---------- Plan committen ("Ich fokussiere mich auf heute") ----------

create or replace function public.commit_daily_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.daily_plans
  set committed_at = coalesce(committed_at, now())
  where id = p_plan_id and user_id = auth.uid();
  if not found then
    raise exception 'AscendOS: Plan nicht gefunden.';
  end if;
end;
$$;

-- ---------- Missions-Status setzen ----------
-- done | deferred | skipped | pending (zurücknehmen).
-- Bei "done" auf kontaktbezogenen Kontakt-Pflege-Missionen wird
-- automatisch ein follow_up-Event dokumentiert (der Tag dokumentiert
-- sich selbst). Pipeline-MEILENSTEINE (3-Way-Call, Registrierung)
-- werden bewusst NIE automatisch gesetzt — die setzt nur der Mensch
-- am Kontakt (sonst verfälschen Missionen die Pipeline-Wahrheit).
-- Bei "done" auf next_step_due wird der erledigte Schritt am Kontakt
-- geleert.

create or replace function public.update_mission_status(
  p_item_id uuid,
  p_status  text,
  p_reason  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.daily_plan_items;
  v_user uuid := auth.uid();
  v_org  uuid;
begin
  if p_status not in ('pending', 'done', 'deferred', 'skipped') then
    raise exception 'AscendOS: Ungültiger Status.';
  end if;

  select i.* into v_item
  from public.daily_plan_items i
  join public.daily_plans p on p.id = i.plan_id
  where i.id = p_item_id and p.user_id = v_user;
  if v_item.id is null then
    raise exception 'AscendOS: Mission nicht gefunden.';
  end if;

  update public.daily_plan_items
  set status = p_status,
      status_reason = p_reason,
      resolved_at = case when p_status in ('done', 'skipped') then now() else null end
  where id = p_item_id;

  if p_status = 'done' and v_item.contact_id is not null then
    if v_item.mission_type in ('follow_up_overdue', 'reactivate_contact', 'presentation_pending') then
      select org_id into v_org from public.profiles where id = v_user;
      insert into public.pipeline_events (contact_id, org_id, event_type, source, created_by)
      values (v_item.contact_id, v_org, 'follow_up', 'system', v_user);
    elsif v_item.mission_type = 'next_step_due' then
      update public.contacts
      set next_step = null, next_step_due = null
      where id = v_item.contact_id and owner_id = v_user;
    end if;
  end if;
end;
$$;

-- ---------- Row Level Security ----------
-- Nur Lesen über die API; jede Schreiboperation läuft ausschließlich
-- über die drei Funktionen oben (ADR-013).

alter table public.daily_plans      enable row level security;
alter table public.daily_plan_items enable row level security;

create policy daily_plans_select_own on public.daily_plans
  for select using (user_id = auth.uid());

create policy daily_plan_items_select_own on public.daily_plan_items
  for select using (
    exists (
      select 1 from public.daily_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );
