-- ============================================================
-- Migration 8 (Sprint 4.6): Audit-Fixes
-- P0: usage_events [P-2], Regel-Engine-Split [A-3]
-- P1: profiles_public [D-1], Korrektur-Events [D-2],
--     match_knowledge-Org-Pflicht [S-3], Invite-Rate-Limit [S-1]
-- ============================================================

-- ============================================================
-- [P-2] usage_events: Basis-Metriken für die Beta (ADR-016)
-- Serverseitig geloggt wo möglich; Client nur app_opened.
-- ============================================================

create table public.usage_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (event_type in (
    'app_opened', 'plan_committed', 'mission_completed',
    'mission_skipped', 'coach_message_sent', 'contact_created'
  )),
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index usage_events_user_idx on public.usage_events (user_id, created_at desc);
create index usage_events_org_idx  on public.usage_events (org_id, event_type, created_at desc);

alter table public.usage_events enable row level security;

create policy usage_events_insert_own on public.usage_events
  for insert with check (user_id = auth.uid() and org_id = public.current_org_id());

create policy usage_events_select_own_or_admin on public.usage_events
  for select using (
    user_id = auth.uid()
    or (public.is_super_admin() and org_id = public.current_org_id())
  );

-- Interner Helfer für serverseitiges Tracking (nur aus Funktionen).
create or replace function public.track_usage(p_user uuid, p_event text, p_meta jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usage_events (user_id, org_id, event_type, metadata)
  select p_user, org_id, p_event, p_meta from public.profiles where id = p_user;
exception when others then
  null; -- Tracking darf nie eine Kernfunktion brechen
end;
$$;

revoke execute on function public.track_usage(uuid, text, jsonb) from anon, authenticated;

-- contact_created serverseitig miterfassen (bestehender Trigger-Pfad):
create or replace function public.log_contact_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pipeline_events (contact_id, org_id, event_type, source, created_by)
  values (new.id, new.org_id, 'contact_created', 'system', new.owner_id);
  perform public.track_usage(new.owner_id, 'contact_created');
  return new;
end;
$$;

-- ============================================================
-- [D-1] profiles: Datenminimierung
-- Tabelle: nur noch das eigene Profil lesbar (+ Admin).
-- Org-Sichtbarkeit: ausschließlich über profiles_public (Basisdaten).
-- ============================================================

drop policy profiles_select_same_org on public.profiles;

create policy profiles_select_own on public.profiles
  for select using (
    id = auth.uid()
    or (public.is_super_admin() and org_id = public.current_org_id())
  );

-- View läuft als Owner (postgres) an RLS vorbei — Filter auf die
-- eigene Org passiert IN der View. Nur unkritische Spalten.
create view public.profiles_public as
select id, org_id, team_id, sponsor_id, role,
       first_name, last_name, username, avatar_url
from public.profiles
where org_id = public.current_org_id();

grant select on public.profiles_public to authenticated;

-- ============================================================
-- [D-2] Korrektur-Events: Fehl-Taps heilen, Historie bleibt.
-- ============================================================

alter table public.pipeline_events
  drop constraint pipeline_events_event_type_check;

alter table public.pipeline_events
  add constraint pipeline_events_event_type_check check (event_type in (
    'contact_created', 'first_touch', 'follow_up',
    'presentation_sent', 'presentation_viewed',
    'fit_check_sent', 'fit_check_completed', 'waytomoon_sent',
    'three_way_call_done', 'party_scheduled', 'party_done',
    'became_customer', 'registered', 'correction'
  ));

create index pipeline_events_correction_idx
  on public.pipeline_events (((payload ->> 'corrects_event_id')))
  where event_type = 'correction';

create or replace function public.correct_pipeline_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.pipeline_events;
  v_user  uuid := auth.uid();
begin
  select e.* into v_event
  from public.pipeline_events e
  join public.contacts c on c.id = e.contact_id
  where e.id = p_event_id and c.owner_id = v_user;

  if v_event.id is null then
    raise exception 'AscendOS: Ereignis nicht gefunden.';
  end if;
  if v_event.event_type in ('correction', 'contact_created') then
    raise exception 'AscendOS: Dieses Ereignis kann nicht korrigiert werden.';
  end if;
  if exists (
    select 1 from public.pipeline_events x
    where x.event_type = 'correction'
      and (x.payload ->> 'corrects_event_id')::uuid = p_event_id
  ) then
    raise exception 'AscendOS: Dieses Ereignis wurde bereits korrigiert.';
  end if;

  insert into public.pipeline_events
    (contact_id, org_id, event_type, source, payload, created_by)
  values (
    v_event.contact_id, v_event.org_id, 'correction', 'system',
    jsonb_build_object('corrects_event_id', p_event_id,
                       'corrected_event_type', v_event.event_type),
    v_user
  );
end;
$$;

-- Wirksame Events = alles außer Korrekturen und Korrigiertem.
create or replace view public.effective_pipeline_events
with (security_invoker = true)
as
select e.*
from public.pipeline_events e
where e.event_type <> 'correction'
  and not exists (
    select 1 from public.pipeline_events x
    where x.event_type = 'correction'
      and (x.payload ->> 'corrects_event_id')::uuid = e.id
  );

-- Phasen-Ableitung nutzt ab jetzt nur wirksame Events.
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
left join public.effective_pipeline_events e on e.contact_id = c.id
group by c.id, c.owner_id;

-- ============================================================
-- [A-3] Regel-Engine: Signal-Split.
-- Ein gemeinsamer Zustands-Helfer + eine Funktion PRO Signal.
-- Neue Quellen (Journey, Sprint 5) = neue Funktion + ein UNION.
-- Verhalten identisch zu Migration 5 (pgTAP muss grün bleiben).
-- ============================================================

create or replace function public.plan_contact_state(p_user uuid)
returns table (
  id uuid, name text, next_step text, next_step_due date,
  max_rank int, last_event_at timestamptz,
  presentation_sent_at timestamptz, presentation_viewed boolean,
  fit_check_done boolean, three_way_done boolean
)
language sql stable
security definer set search_path = public
as $$
  select
    c.id, c.name, c.next_step, c.next_step_due,
    coalesce(max(public.event_phase_rank(e.event_type)), 0),
    max(e.occurred_at),
    max(e.occurred_at) filter (where e.event_type = 'presentation_sent'),
    coalesce(bool_or(e.event_type = 'presentation_viewed'), false),
    coalesce(bool_or(e.event_type = 'fit_check_completed'), false),
    coalesce(bool_or(e.event_type = 'three_way_call_done'), false)
  from public.contacts c
  left join public.effective_pipeline_events e on e.contact_id = c.id
  where c.owner_id = p_user
  group by c.id;
$$;

create or replace function public.plan_signal_fit_check(p_user uuid, p_date date)
returns table (contact_id uuid, mission_type text, title text, reason text, score int)
language sql stable security definer set search_path = public
as $$
  select id, 'fit_check_next_step',
    '3-Way-Call mit ' || name || ' organisieren',
    'Fit Check ist abgeschlossen — jetzt entscheidet der nächste Schritt.',
    100
  from public.plan_contact_state(p_user)
  where fit_check_done and not three_way_done and max_rank < 60;
$$;

create or replace function public.plan_signal_next_step(p_user uuid, p_date date)
returns table (contact_id uuid, mission_type text, title text, reason text, score int)
language sql stable security definer set search_path = public
as $$
  select id, 'next_step_due',
    coalesce(next_step, 'Geplanten Schritt bei ' || name || ' erledigen'),
    case when next_step_due < p_date
      then 'Bei ' || name || ' seit ' || (p_date - next_step_due) || ' Tag(en) überfällig.'
      else 'Für heute bei ' || name || ' geplant.'
    end,
    case when next_step_due < p_date then 95 else 90 end
  from public.plan_contact_state(p_user)
  where next_step_due is not null and next_step_due <= p_date and max_rank < 70;
$$;

create or replace function public.plan_signal_presentation(p_user uuid, p_date date)
returns table (contact_id uuid, mission_type text, title text, reason text, score int)
language sql stable security definer set search_path = public
as $$
  select id, 'presentation_pending',
    'Bei ' || name || ' zur Präsentation nachfassen',
    'Präsentation vor ' || extract(day from now() - presentation_sent_at)::int ||
      ' Tagen gesendet, noch nicht angesehen.',
    80
  from public.plan_contact_state(p_user)
  where presentation_sent_at is not null
    and not presentation_viewed
    and presentation_sent_at < now() - interval '2 days'
    and max_rank < 60;
$$;

create or replace function public.plan_signal_follow_up(p_user uuid, p_date date)
returns table (contact_id uuid, mission_type text, title text, reason text, score int)
language sql stable security definer set search_path = public
as $$
  select id, 'follow_up_overdue',
    name || ' kontaktieren',
    'Seit ' || extract(day from now() - last_event_at)::int ||
      ' Tagen kein Kontakt — bleib präsent.',
    least(60 + extract(day from now() - last_event_at)::int, 75)
  from public.plan_contact_state(p_user)
  where last_event_at < now() - interval '7 days'
    and last_event_at >= now() - interval '14 days'
    and max_rank between 10 and 50;
$$;

create or replace function public.plan_signal_reactivate(p_user uuid, p_date date)
returns table (contact_id uuid, mission_type text, title text, reason text, score int)
language sql stable security definer set search_path = public
as $$
  select id, 'reactivate_contact',
    name || ' reaktivieren',
    'Seit ' || extract(day from now() - last_event_at)::int ||
      ' Tagen keine Aktivität — ein kurzes Lebenszeichen genügt.',
    50
  from public.plan_contact_state(p_user)
  where last_event_at < now() - interval '14 days' and max_rank < 60;
$$;

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
  from public.daily_plans where user_id = v_user and plan_date = p_date;
  if v_plan_id is not null then
    return v_plan_id;
  end if;

  insert into public.daily_plans (user_id, org_id, plan_date)
  values (v_user, v_org, p_date)
  returning id into v_plan_id;

  with candidates as (
    select * from public.plan_signal_fit_check(v_user, p_date)
    union all select * from public.plan_signal_next_step(v_user, p_date)
    union all select * from public.plan_signal_presentation(v_user, p_date)
    union all select * from public.plan_signal_follow_up(v_user, p_date)
    union all select * from public.plan_signal_reactivate(v_user, p_date)
  ),
  best_per_contact as (
    select distinct on (contact_id) *
    from candidates order by contact_id, score desc
  )
  insert into public.daily_plan_items
    (plan_id, contact_id, mission_type, title, reason, score, position)
  select v_plan_id, contact_id, mission_type, title, reason, score,
         row_number() over (order by score desc, title)
  from best_per_contact
  order by score desc, title
  limit 5;

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

-- Tracking in die bestehenden Schreibpfade:
create or replace function public.commit_daily_plan(p_plan_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.daily_plans
  set committed_at = coalesce(committed_at, now())
  where id = p_plan_id and user_id = auth.uid();
  if not found then
    raise exception 'AscendOS: Plan nicht gefunden.';
  end if;
  perform public.track_usage(auth.uid(), 'plan_committed');
end;
$$;

create or replace function public.update_mission_status(
  p_item_id uuid, p_status text, p_reason text default null
)
returns void
language plpgsql security definer set search_path = public
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
  set status = p_status, status_reason = p_reason,
      resolved_at = case when p_status in ('done', 'skipped') then now() else null end
  where id = p_item_id;

  if p_status = 'done' and v_item.contact_id is not null then
    if v_item.mission_type in ('follow_up_overdue', 'reactivate_contact', 'presentation_pending') then
      select org_id into v_org from public.profiles where id = v_user;
      insert into public.pipeline_events (contact_id, org_id, event_type, source, created_by)
      values (v_item.contact_id, v_org, 'follow_up', 'system', v_user);
    elsif v_item.mission_type = 'next_step_due' then
      update public.contacts set next_step = null, next_step_due = null
      where id = v_item.contact_id and owner_id = v_user;
    end if;
  end if;

  if p_status = 'done' then
    perform public.track_usage(v_user, 'mission_completed',
      jsonb_build_object('mission_type', v_item.mission_type));
  elsif p_status = 'skipped' then
    perform public.track_usage(v_user, 'mission_skipped',
      jsonb_build_object('mission_type', v_item.mission_type, 'reason', p_reason));
  end if;
end;
$$;

-- ============================================================
-- [S-3] match_knowledge: Org-Filter wird PFLICHT (Defense-in-Depth).
-- Alte Signatur wird entfernt, damit kein Aufrufer sie vergisst.
-- ============================================================

drop function public.match_knowledge(extensions.vector, text[], int, float);

create or replace function public.match_knowledge(
  query_embedding extensions.vector(1536),
  p_org_id uuid,
  match_categories text[] default null,
  match_count int default 5,
  min_similarity float default 0.25
)
returns table (doc_id uuid, doc_title text, category text, content text, similarity float)
language sql stable
as $$
  select d.id, d.title, d.category, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_docs d on d.id = c.doc_id
  where c.embedding is not null
    and d.org_id = p_org_id
    and (match_categories is null or d.category = any(match_categories))
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================
-- [S-1] validate_invite: anonymer RPC-Zugriff entfällt.
-- Validierung läuft NUR noch über die Edge Function
-- validate-invite (IP-Rate-Limit); Versuchszähler:
-- ============================================================

revoke execute on function public.validate_invite(text) from anon;

create table public.invite_validation_attempts (
  id         uuid primary key default gen_random_uuid(),
  ip         text not null,
  created_at timestamptz not null default now()
);

create index invite_attempts_ip_idx
  on public.invite_validation_attempts (ip, created_at desc);

alter table public.invite_validation_attempts enable row level security;
-- Keine Policies: nur die Service-Role (Edge Function) schreibt/liest.
