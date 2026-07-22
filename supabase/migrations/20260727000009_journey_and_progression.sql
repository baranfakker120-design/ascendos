-- ============================================================
-- Migration 9 (Sprint 5): Journey-Engine & Progression
-- Journeys/Steps/Progress (ADR-005), Sponsor sieht NUR Fortschritt
-- der Firstline, Achievements rein datengetrieben (Phase 3).
-- ============================================================

-- ---------- Journey-Engine ----------

create table public.journeys (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  team_id     uuid references public.teams(id) on delete cascade,
  title       text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.journey_steps (
  id           uuid primary key default gen_random_uuid(),
  journey_id   uuid not null references public.journeys(id) on delete cascade,
  day_number   int not null check (day_number >= 1),
  step_order   int not null default 1,
  title        text not null,
  content_type text not null default 'task'
               check (content_type in ('info', 'task', 'tool')),
  -- content: { body, cta?, link?, tool_key? } — Inhalte sind Daten,
  -- nie Code (ADR-005). tool_key referenziert external_tools.key.
  content      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index journey_steps_journey_idx
  on public.journey_steps (journey_id, day_number, step_order);

create table public.user_progress (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  step_id      uuid not null references public.journey_steps(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, step_id)
);

alter table public.journeys      enable row level security;
alter table public.journey_steps enable row level security;
alter table public.user_progress enable row level security;

create policy journeys_select_member on public.journeys
  for select using (
    org_id = public.current_org_id()
    and (team_id is null
         or team_id = (select team_id from public.profiles where id = auth.uid()))
    and is_active
  );

create policy journeys_admin_all on public.journeys
  for all using (public.is_super_admin() and org_id = public.current_org_id());

create policy journey_steps_select_member on public.journey_steps
  for select using (exists (select 1 from public.journeys j where j.id = journey_id));

create policy journey_steps_admin_all on public.journey_steps
  for all using (
    public.is_super_admin()
    and exists (select 1 from public.journeys j
                where j.id = journey_id and j.org_id = public.current_org_id())
  );

-- Fortschritt: eigener voll; der SPONSOR liest AUSSCHLIESSLICH die
-- Fortschrittszeilen seiner Firstline (Anforderung Sprint 5.4) —
-- keine Inhalte darüber hinaus, keine persönlichen Daten.
create policy user_progress_select_own_or_sponsor on public.user_progress
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p
               where p.id = user_id and p.sponsor_id = auth.uid())
  );
-- Kein INSERT über die API: nur über complete_journey_step().

-- ---------- Schritt abschließen (mit Tages-Freischaltung) ----------
-- Tag N ist freigeschaltet, wenn alle Schritte der Tage < N erledigt
-- sind. Innerhalb eines Tages ist die Reihenfolge frei.

create or replace function public.complete_journey_step(p_step_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_step public.journey_steps;
  v_unlocked_day int;
begin
  select s.* into v_step
  from public.journey_steps s
  join public.journeys j on j.id = s.journey_id
  join public.profiles pr on pr.id = v_user
  where s.id = p_step_id
    and j.org_id = pr.org_id
    and (j.team_id is null or j.team_id = pr.team_id)
    and j.is_active;
  if v_step.id is null then
    raise exception 'AscendOS: Schritt nicht gefunden.';
  end if;

  select coalesce(min(s.day_number), 1) into v_unlocked_day
  from public.journey_steps s
  left join public.user_progress up
    on up.step_id = s.id and up.user_id = v_user
  where s.journey_id = v_step.journey_id
    and up.step_id is null;

  if v_step.day_number > v_unlocked_day then
    raise exception 'AscendOS: Dieser Tag ist noch nicht freigeschaltet. Schließe erst die vorherigen Tage ab.';
  end if;

  insert into public.user_progress (user_id, step_id)
  values (v_user, p_step_id)
  on conflict do nothing;

  perform public.track_usage(v_user, 'journey_step_completed',
    jsonb_build_object('day', v_step.day_number));
end;
$$;

-- usage_events: neuen Typ zulassen
alter table public.usage_events drop constraint usage_events_event_type_check;
alter table public.usage_events add constraint usage_events_event_type_check
  check (event_type in (
    'app_opened', 'plan_committed', 'mission_completed', 'mission_skipped',
    'coach_message_sent', 'contact_created', 'journey_step_completed'
  ));

-- Sponsor-Sicht: aggregierter Fortschritt der Firstline.
-- security_invoker: die user_progress-RLS oben ist die Wahrheit.
create view public.firstline_journey_progress
with (security_invoker = true)
as
select
  p.id as user_id,
  p.first_name,
  p.username,
  j.id as journey_id,
  j.title as journey_title,
  count(s.id) as total_steps,
  count(up.step_id) as completed_steps,
  coalesce(min(s.day_number) filter (where up.step_id is null),
           max(s.day_number) + 1) as current_day,
  max(s.day_number) as total_days
from public.profiles_public p
join public.journeys j
  on j.org_id = p.org_id
 and (j.team_id is null or j.team_id = p.team_id)
 and j.is_active
join public.journey_steps s on s.journey_id = j.id
left join public.user_progress up
  on up.step_id = s.id and up.user_id = p.id
where p.sponsor_id = auth.uid()
group by p.id, p.first_name, p.username, j.id, j.title;

-- ---------- Achievements: rein datengetrieben ----------
-- condition (jsonb), unterstützte Typen des Evaluators:
--  {"type":"event_count","event_type":"follow_up","count":100}
--  {"type":"phase_count","min_rank":70,"count":1}     (z. B. Partner)
--  {"type":"firstline_count","count":1}
--  {"type":"downline_count","count":2}                (> Firstline)
--  {"type":"journey_completed"}
-- Neue Achievements = neue Zeile. Neue TYPEN = Migration (bewusst:
-- der Evaluator ist die einzige Codestelle, ADR-005-Prinzip).

create table public.achievements (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  key         text not null,
  title       text not null,
  description text not null,
  icon        text not null default '⭐',
  condition   jsonb not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (org_id, key)
);

create table public.user_achievements (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.achievements      enable row level security;
alter table public.user_achievements enable row level security;

create policy achievements_select_member on public.achievements
  for select using (org_id = public.current_org_id() and is_active);

create policy achievements_admin_all on public.achievements
  for all using (public.is_super_admin() and org_id = public.current_org_id());

create policy user_achievements_select_own on public.user_achievements
  for select using (user_id = auth.uid());
-- Freischaltung nur über check_achievements().

-- Evaluator: idempotent, prüft alle aktiven Definitionen der Org
-- gegen echte Daten und schaltet Fehlendes frei.
create or replace function public.check_achievements()
returns setof uuid -- neu freigeschaltete achievement_ids
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid;
  a record;
  v_ok boolean;
  v_needed int;
begin
  select org_id into v_org from public.profiles where id = v_user;
  if v_org is null then return; end if;

  for a in
    select * from public.achievements
    where org_id = v_org and is_active
      and id not in (select achievement_id from public.user_achievements
                     where user_id = v_user)
  loop
    v_needed := coalesce((a.condition ->> 'count')::int, 1);
    v_ok := case a.condition ->> 'type'
      when 'event_count' then (
        select count(*) >= v_needed
        from public.effective_pipeline_events e
        where e.created_by = v_user
          and e.event_type = a.condition ->> 'event_type'
      )
      when 'phase_count' then (
        select count(*) >= v_needed
        from public.contacts c
        where c.owner_id = v_user
          and (select coalesce(max(public.event_phase_rank(e.event_type)), 0)
               from public.effective_pipeline_events e
               where e.contact_id = c.id) >= (a.condition ->> 'min_rank')::int
      )
      when 'firstline_count' then (
        select count(*) >= v_needed
        from public.profiles p where p.sponsor_id = v_user
      )
      when 'downline_count' then (
        select count(*) >= v_needed from public.get_downline(v_user)
      )
      else false -- 'journey_completed' wird unten separat geprüft
    end;

    if a.condition ->> 'type' = 'journey_completed' then
      select exists (
        select 1
        from public.journeys j
        join public.profiles pr on pr.id = v_user
        where j.org_id = v_org and j.is_active
          and (j.team_id is null or j.team_id = pr.team_id)
          and (select count(*) from public.journey_steps s where s.journey_id = j.id)
            = (select count(*) from public.user_progress up
               join public.journey_steps s on s.id = up.step_id
               where up.user_id = v_user and s.journey_id = j.id)
          and (select count(*) from public.journey_steps s where s.journey_id = j.id) > 0
      ) into v_ok;
    end if;

    if v_ok then
      insert into public.user_achievements (user_id, achievement_id)
      values (v_user, a.id)
      on conflict do nothing;
      return next a.id;
    end if;
  end loop;
  return;
end;
$$;
