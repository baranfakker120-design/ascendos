-- ============================================================
-- AscendOS — KOMPLETTES SETUP IN EINER DATEI (Mobile Setup Kit)
-- Einfügen in: Supabase Dashboard → SQL Editor → Run.
-- Läuft nur auf einem LEEREN Projekt (Schutz gegen Doppelt-Ausführen).
--
-- GENERIERT von scripts/build-setup-sql.mjs — NICHT von Hand ändern.
-- Quellen: supabase/migrations/*.sql + setup/bootstrap.sql
-- ============================================================

do $$ begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'organizations') then
    raise exception 'Setup abgebrochen: Dieses Projekt wurde bereits eingerichtet.';
  end if;
end $$;

-- ############ 20260721000001_tenancy_and_profiles.sql ############
-- ============================================================
-- Migration 1: Mandanten-Fundament & Genealogie
-- organizations -> teams -> profiles (ADR-002, ADR-004)
-- ============================================================

-- ---------- Tabellen ----------

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  branding    jsonb not null default '{}'::jsonb,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table public.teams (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  parent_team_id  uuid references public.teams(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index teams_org_id_idx on public.teams (org_id);

-- profiles: 1:1 zu auth.users. sponsor_id bildet die Genealogie ab
-- (einzige Quelle der Wahrheit, ADR-004). Nur Gründer-Accounts haben
-- sponsor_id NULL.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete restrict,
  team_id     uuid not null references public.teams(id) on delete restrict,
  sponsor_id  uuid references public.profiles(id) on delete set null,
  role        text not null default 'berater'
              check (role in ('super_admin', 'leader', 'berater')),
  first_name  text not null,
  last_name   text not null,
  username    text not null unique
              check (username ~ '^[a-z0-9_.]{3,30}$'),
  phone       text,
  country     text,
  language    text not null default 'de',
  avatar_url  text,
  goals       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_org_id_idx     on public.profiles (org_id);
create index profiles_team_id_idx    on public.profiles (team_id);
create index profiles_sponsor_id_idx on public.profiles (sponsor_id);

-- updated_at automatisch pflegen
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- Helper-Funktionen für RLS ----------
-- SECURITY DEFINER, damit sie profiles trotz RLS lesen können.
-- STABLE: Ergebnis ist pro Statement konstant -> Planner darf cachen.
-- (Sprint-1-Entscheidung: Helper statt JWT-Custom-Claims; siehe ADR-021.)

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'super_admin' from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Genealogie: komplette Downline eines Nutzers (exklusive ihm selbst).
-- Recursive CTE (ADR-004), gekapselt für spätere Policies und Features.
create or replace function public.get_downline(root_user_id uuid)
returns table (user_id uuid, depth int)
language sql
stable
security definer
set search_path = public
as $$
  with recursive downline as (
    select p.id as user_id, 1 as depth
    from public.profiles p
    where p.sponsor_id = root_user_id
    union all
    select p.id, d.depth + 1
    from public.profiles p
    join downline d on p.sponsor_id = d.user_id
  )
  select user_id, depth from downline;
$$;

-- ---------- Schutz vor Privilegien-Eskalation ----------
-- Nutzer dürfen ihr Profil bearbeiten, aber niemals ihre eigene Rolle,
-- Org, Team oder ihren Sponsor ändern. Das erzwingt die DB, nicht das UI.

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
as $$
begin
  if public.is_super_admin() then
    return new; -- Admins dürfen verwalten
  end if;

  if new.role       is distinct from old.role
  or new.org_id     is distinct from old.org_id
  or new.team_id    is distinct from old.team_id
  or new.sponsor_id is distinct from old.sponsor_id then
    raise exception 'AscendOS: Rolle, Organisation, Team und Sponsor können nicht selbst geändert werden.';
  end if;

  return new;
end;
$$;

create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------- Row Level Security ----------

alter table public.organizations enable row level security;
alter table public.teams         enable row level security;
alter table public.profiles      enable row level security;

-- organizations: Mitglieder lesen ihre eigene Org, nur super_admin schreibt.
create policy organizations_select_member on public.organizations
  for select using (id = public.current_org_id());

create policy organizations_update_admin on public.organizations
  for update using (public.is_super_admin() and id = public.current_org_id());

-- teams: sichtbar innerhalb der eigenen Org, Verwaltung nur super_admin.
create policy teams_select_member on public.teams
  for select using (org_id = public.current_org_id());

create policy teams_admin_insert on public.teams
  for insert with check (public.is_super_admin() and org_id = public.current_org_id());

create policy teams_admin_update on public.teams
  for update using (public.is_super_admin() and org_id = public.current_org_id());

-- profiles: eigenes Profil voll, Profile derselben Org lesbar
-- (Basisdaten für Team-Anzeige & Sponsor-Namen; Kontaktdaten von
-- Kontakten liegen NICHT hier, sondern in contacts mit Owner-only-RLS).
create policy profiles_select_same_org on public.profiles
  for select using (org_id = public.current_org_id());

create policy profiles_update_own on public.profiles
  for update using (id = auth.uid());

create policy profiles_admin_update on public.profiles
  for update using (public.is_super_admin() and org_id = public.current_org_id());

-- Kein INSERT/DELETE über die API: Profile entstehen ausschließlich
-- über den Registrierungs-Trigger (Migration 2); Löschung ist ein
-- kontrollierter Prozess (Löschkonzept, ADR-020) und kommt als eigene
-- Funktion in einem späteren Sprint.

-- ############ 20260721000002_invites_and_registration.sql ############
-- ============================================================
-- Migration 2: Invites & Registrierung
-- Registrierung ausschließlich per Invite-Code. Sponsor, Team und
-- Org werden transaktional im Signup gesetzt (ADR-021).
-- ============================================================

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  -- NULL nur für Gründer-Invites (Seed): erster Account ohne Sponsor.
  sponsor_id  uuid references public.profiles(id) on delete cascade,
  role        text not null default 'berater'
              check (role in ('super_admin', 'leader', 'berater')),
  expires_at  timestamptz not null default now() + interval '14 days',
  used_by     uuid references public.profiles(id) on delete set null,
  used_at     timestamptz,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index invites_code_idx       on public.invites (code);
create index invites_sponsor_id_idx on public.invites (sponsor_id);

-- ---------- Invite erzeugen ----------
-- Jedes Org-Mitglied kann Partner in sein eigenes Team einladen;
-- der Einladende ist automatisch der Sponsor. Rollen-Vergabe per
-- Invite ist super_admin vorbehalten.

create or replace function public.create_invite(invite_role text default 'berater')
returns table (invite_code text, invite_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_code text;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null then
    raise exception 'AscendOS: Kein Profil für diesen Nutzer gefunden.';
  end if;

  if invite_role <> 'berater' and v_profile.role <> 'super_admin' then
    raise exception 'AscendOS: Nur Super-Admins können Leader- oder Admin-Einladungen erstellen.';
  end if;

  -- 10 Zeichen, gut vorlesbar (keine 0/O, 1/I)
  v_code := upper(
    substring(replace(replace(replace(replace(
      encode(gen_random_bytes(8), 'base64'),
      '/', 'A'), '+', 'B'), '0', 'C'), 'O', 'D')
    from 1 for 10)
  );

  insert into public.invites (code, org_id, team_id, sponsor_id, role, created_by)
  values (v_code, v_profile.org_id, v_profile.team_id, v_profile.id, invite_role, v_profile.id);

  return query
    select i.code, i.expires_at from public.invites i where i.code = v_code;
end;
$$;

-- ---------- Invite validieren (vor dem Signup, anonym aufrufbar) ----------
-- Gibt bewusst nur an, was die Registrierungsseite anzeigen darf:
-- Org-Name, Team-Name, Sponsor-Vorname. Keine IDs, keine weiteren Daten.

create or replace function public.validate_invite(invite_code text)
returns table (org_name text, team_name text, sponsor_first_name text)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.name,
    t.name,
    p.first_name
  from public.invites i
  join public.organizations o on o.id = i.org_id
  join public.teams t on t.id = i.team_id
  left join public.profiles p on p.id = i.sponsor_id
  where i.code = upper(trim(invite_code))
    and i.used_at is null
    and i.expires_at > now();
$$;

grant execute on function public.validate_invite(text) to anon;

-- ---------- Registrierung: Trigger auf auth.users ----------
-- Der Signup übergibt invite_code, first_name, last_name, username als
-- user_metadata. Der Trigger validiert den Invite, legt das Profil an
-- und markiert den Invite als verwendet — in EINER Transaktion.
-- Ungültiger Code => Exception => der komplette Signup schlägt fehl.
-- Es kann nie einen Auth-User ohne Genealogie geben.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites;
  v_code text;
  v_username text;
begin
  v_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  if v_code = '' then
    raise exception 'AscendOS: Registrierung ist nur mit Einladungscode möglich.';
  end if;

  select * into v_invite
  from public.invites
  where code = v_code
  for update; -- sperrt den Invite gegen parallele Einlösung

  if v_invite.id is null then
    raise exception 'AscendOS: Dieser Einladungscode existiert nicht.';
  end if;
  if v_invite.used_at is not null then
    raise exception 'AscendOS: Dieser Einladungscode wurde bereits verwendet.';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'AscendOS: Dieser Einladungscode ist abgelaufen.';
  end if;

  v_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  if v_username !~ '^[a-z0-9_.]{3,30}$' then
    raise exception 'AscendOS: Benutzername muss 3-30 Zeichen lang sein (a-z, 0-9, Punkt, Unterstrich).';
  end if;
  if exists (select 1 from public.profiles where username = v_username) then
    raise exception 'AscendOS: Dieser Benutzername ist bereits vergeben.';
  end if;

  insert into public.profiles
    (id, org_id, team_id, sponsor_id, role, first_name, last_name, username, language)
  values (
    new.id,
    v_invite.org_id,
    v_invite.team_id,
    v_invite.sponsor_id,
    v_invite.role,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''), 'Unbekannt'),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''), ''),
    v_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'language', ''), 'de')
  );

  update public.invites
  set used_by = new.id, used_at = now()
  where id = v_invite.id;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row Level Security ----------

alter table public.invites enable row level security;

-- Sichtbar: eigene erstellte Invites; super_admin sieht alle der Org.
create policy invites_select_own on public.invites
  for select using (
    created_by = auth.uid()
    or (public.is_super_admin() and org_id = public.current_org_id())
  );

-- Kein direktes INSERT/UPDATE über die API:
-- Erstellen nur über create_invite(), Einlösen nur über den Trigger.

-- ############ 20260721000003_contacts_and_pipeline.sql ############
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

-- ############ 20260722000004_pipeline_refinement_and_tools.sql ############
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

-- ############ 20260723000005_daily_command_center.sql ############
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

-- ############ 20260724000006_coach_and_knowledge.sql ############
-- ============================================================
-- Migration 6 (Sprint 4): KI-Coach
-- Agenten als Datensätze (ADR-011), Wissensbasis mit pgvector
-- (ADR-009/010), Konversationen, Wissenslücken-Log.
-- ============================================================

create extension if not exists vector with schema extensions;

-- ---------- Agenten: Konfiguration statt Code (ADR-011) ----------

create table public.agents (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  key            text not null,
  name           text not null,
  system_prompt  text not null,
  -- Retrieval-Filter: nur Wissens-Kategorien dieses Spezialisten.
  retrieval_categories text[] not null default '{}',
  model          text not null default 'claude-sonnet-4-6',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (org_id, key)
);

alter table public.agents enable row level security;

create policy agents_select_member on public.agents
  for select using (org_id = public.current_org_id() and is_active);

create policy agents_admin_all on public.agents
  for all using (public.is_super_admin() and org_id = public.current_org_id());

-- ---------- Wissensbasis (ADR-009 / ADR-010) ----------

create table public.knowledge_docs (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  team_id           uuid references public.teams(id) on delete cascade,
  title             text not null,
  category          text not null,
  language          text not null default 'de',
  version           int not null default 1,
  author_id         uuid references public.profiles(id) on delete set null,
  status            text not null default 'draft'
                    check (status in ('draft', 'approved', 'archived')),
  source_type       text not null default 'document'
                    check (source_type in ('document', 'transcript', 'faq',
                                           'guideline', 'best_practice')),
  valid_from        timestamptz not null default now(),
  valid_until       timestamptz,
  tags              text[] not null default '{}',
  supersedes_doc_id uuid references public.knowledge_docs(id) on delete set null,
  created_at        timestamptz not null default now()
);

create table public.knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  doc_id      uuid not null references public.knowledge_docs(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  chunk_index int not null,
  content     text not null,
  embedding   extensions.vector(1536), -- OpenAI text-embedding-3-small
  created_at  timestamptz not null default now()
);

create index knowledge_chunks_doc_idx on public.knowledge_chunks (doc_id);
create index knowledge_chunks_embedding_idx on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.knowledge_docs   enable row level security;
alter table public.knowledge_chunks enable row level security;

-- Freigegebenes, gültiges Wissen der eigenen Org (Team-Wissen nur fürs
-- eigene Team). Drafts sieht nur der Admin (ADR-010: approval-gated).
create policy knowledge_docs_select_approved on public.knowledge_docs
  for select using (
    org_id = public.current_org_id()
    and (
      (status = 'approved'
        and (valid_until is null or valid_until > now())
        and (team_id is null
             or team_id = (select team_id from public.profiles where id = auth.uid())))
      or public.is_super_admin()
    )
  );

create policy knowledge_docs_admin_write on public.knowledge_docs
  for all using (public.is_super_admin() and org_id = public.current_org_id());

create policy knowledge_chunks_select on public.knowledge_chunks
  for select using (
    exists (select 1 from public.knowledge_docs d where d.id = doc_id)
    -- Sichtbarkeit erbt vollständig von der Doc-Policy oben.
  );

create policy knowledge_chunks_admin_write on public.knowledge_chunks
  for all using (public.is_super_admin() and org_id = public.current_org_id());

-- Semantische Suche: läuft als Invoker -> RLS der Chunks/Docs greift.
create or replace function public.match_knowledge(
  query_embedding extensions.vector(1536),
  match_categories text[] default null,
  match_count int default 5,
  min_similarity float default 0.25
)
returns table (doc_id uuid, doc_title text, category text, content text, similarity float)
language sql
stable
as $$
  select
    d.id,
    d.title,
    d.category,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_docs d on d.id = c.doc_id
  where c.embedding is not null
    and (match_categories is null or d.category = any(match_categories))
    and 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------- Wissenslücken: nachfragegetriebene Erfassung ----------

create table public.knowledge_gaps (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  agent_key  text not null,
  question   text not null,
  created_at timestamptz not null default now()
);

alter table public.knowledge_gaps enable row level security;

create policy knowledge_gaps_insert_own on public.knowledge_gaps
  for insert with check (user_id = auth.uid() and org_id = public.current_org_id());

create policy knowledge_gaps_admin_select on public.knowledge_gaps
  for select using (public.is_super_admin() and org_id = public.current_org_id());

-- ---------- Konversationen ----------

create table public.coach_convos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  agent_key  text,
  created_at timestamptz not null default now()
);

create table public.coach_messages (
  id         uuid primary key default gen_random_uuid(),
  convo_id   uuid not null references public.coach_convos(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);

create index coach_convos_user_idx on public.coach_convos (user_id, created_at desc);
create index coach_messages_convo_idx on public.coach_messages (convo_id, created_at);

alter table public.coach_convos   enable row level security;
alter table public.coach_messages enable row level security;

create policy coach_convos_own on public.coach_convos
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and org_id = public.current_org_id());

create policy coach_messages_own on public.coach_messages
  for all
  using (exists (select 1 from public.coach_convos c
                 where c.id = convo_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.coach_convos c
                      where c.id = convo_id and c.user_id = auth.uid()));

-- Kostenkontrolle (ADR-007): Tageslimit pro Nutzer aus den
-- Org-Einstellungen; die Edge Function prüft vor jedem LLM-Aufruf.
create or replace function public.coach_messages_today(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.coach_messages m
  join public.coach_convos c on c.id = m.convo_id
  where c.user_id = p_user
    and m.role = 'user'
    and m.created_at >= date_trunc('day', now());
$$;

-- ############ 20260725000007_stabilization_fixes.sql ############
-- ============================================================
-- Migration 7 (Sprint 4.5): Stabilisierungs-Fixes.
-- Bugfix: create_invite nutzte gen_random_bytes ohne pgcrypto-
-- Qualifizierung — mit search_path=public wäre die Funktion in
-- Production beim ersten Aufruf gescheitert. Angewendete
-- Migrationen werden nie editiert (ADR-018), daher Fix-Migration.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.create_invite(invite_role text default 'berater')
returns table (invite_code text, invite_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_code text;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null then
    raise exception 'AscendOS: Kein Profil für diesen Nutzer gefunden.';
  end if;

  if invite_role <> 'berater' and v_profile.role <> 'super_admin' then
    raise exception 'AscendOS: Nur Super-Admins können Leader- oder Admin-Einladungen erstellen.';
  end if;

  -- 10 Zeichen, gut vorlesbar (keine 0/O, 1/I); pgcrypto explizit
  -- über das extensions-Schema angesprochen.
  v_code := upper(
    substring(replace(replace(replace(replace(
      encode(extensions.gen_random_bytes(8), 'base64'),
      '/', 'A'), '+', 'B'), '0', 'C'), 'O', 'D')
    from 1 for 10)
  );

  insert into public.invites (code, org_id, team_id, sponsor_id, role, created_by)
  values (v_code, v_profile.org_id, v_profile.team_id, v_profile.id, invite_role, v_profile.id);

  return query
    select i.code, i.expires_at from public.invites i where i.code = v_code;
end;
$$;

-- ############ 20260726000008_audit_fixes.sql ############
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

-- ############ 20260727000009_journey_and_progression.sql ############
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

-- ############ 20260728000010_openai_only.sql ############
-- ============================================================
-- Migration 10 (ADR-024): LLM-Provider ausschließlich OpenAI.
-- agents.model trug Claude-Modellnamen als DATEN — Default und
-- Bestandszeilen werden umgestellt. (Angewendete Migrationen
-- werden nie editiert, daher Fix-Migration; ADR-018.)
-- ============================================================

alter table public.agents alter column model set default 'gpt-4.1';

update public.agents
set model = 'gpt-4.1'
where lower(model) like 'claude%';

-- ############ 20260729000011_openai_model_baseline.sql ############
-- ============================================================
-- Migration 11 (ADR-025): Modell-Baseline auf die aktuelle
-- OpenAI-Generation heben.
--
-- Warum eine eigene Migration statt Edit von Migration 10:
-- angewendete Migrationen werden nie verändert (ADR-018).
--
-- `agents.model` bleibt DATEN. Diese Migration setzt nur die
-- Ausgangswerte; einzelne Agenten dürfen abweichend konfiguriert
-- werden, und `resolveModel()` in _shared/llm.ts fängt Alt-Werte
-- (Claude-Namen) zur Laufzeit defensiv ab.
--
-- Rollback: Default zurück auf 'gpt-4.1' setzen und die Zeilen
-- entsprechend updaten — es gibt keine Schemaänderung.
-- ============================================================

alter table public.agents alter column model set default 'gpt-5.6';

-- 1) Alt-Daten aus der Anthropic-Zeit nach Leistungsklasse mappen.
--    Diese Werte würden sonst einen 400er der OpenAI-API auslösen.
update public.agents
set model = case
  when lower(model) like '%haiku%' then 'gpt-5.6-luna'
  else 'gpt-5.6'
end
where lower(model) like '%claude%'
   or lower(model) like '%anthropic%';

-- 2) Legacy-Generation auf die aktuelle Generation heben. Bewusst nur
--    exakte Treffer — individuell gepflegte Sondermodelle einzelner
--    Orgs bleiben unangetastet.
update public.agents
set model = 'gpt-5.6'
where model in ('gpt-4.1', 'gpt-4-turbo', 'gpt-4o');

update public.agents
set model = 'gpt-5.6-luna'
where model in ('gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o-mini');

-- 3) Sicherheitsnetz: leere Modelle sind ein Deployment-Fehler, der sich
--    sonst erst zur Laufzeit als 400er zeigt.
update public.agents
set model = 'gpt-5.6'
where model is null or btrim(model) = '';

-- ############ 20260730000012_f1_function_security.sql ############
-- ============================================================
-- Migration 12 (F1): Sicherheitshärtung der Datenbankfunktionen
--
-- Behebt neun Funktionen, die mit SECURITY DEFINER laufen, einen
-- fremden Nutzerparameter annehmen und den Aufrufer nicht prüfen.
-- Vollständige Analyse: docs/f1-security-analysis.md
--
-- Kernbefunde:
--   1. plan_contact_state und die fünf plan_signal_* geben die
--      Kontaktliste beliebiger Nutzer heraus, inklusive Name und
--      next_step. Personenbezogene Daten Dritter.
--   2. get_downline hat keinen org_id-Filter, also mandanten-
--      übergreifende Genealogie.
--   3. track_usage ist schreibend, ungeprüft und für PUBLIC offen.
--   4. Vier Funktionen haben keinen festgenagelten search_path.
--
-- WICHTIG zur Reihenfolge der Rechte:
-- Ein "revoke ... from anon" ist WIRKUNGSLOS, solange PUBLIC das
-- Recht besitzt, weil anon es über PUBLIC erbt. Migration 8 hat
-- unter [S-1] genau diesen Fehler gemacht: validate_invite trägt
-- weiterhin das PUBLIC-Recht und ist für anon aufrufbar. Deshalb
-- wird hier zuerst PUBLIC entzogen und danach selektiv gewährt.
--
-- Rücknahme: Migration 1 und 8 enthalten die Ursprungsfassungen.
-- Eine Rücknahme wäre eine neue Migration (ADR-018) und würde die
-- Lücken wieder öffnen.
-- ============================================================

-- ============================================================
-- Teil 1: Neuer Baustein für die Sichtbarkeitsprüfung
-- ============================================================

-- Beantwortet genau eine Frage: Steht der aufrufende Nutzer in
-- derselben Organisation oberhalb von p_target?
--
-- Bewusst klein geschnitten. Befund F2 des Reviews fordert eine
-- allgemeine Funktion can_see_user(); die wird hier NICHT gebaut,
-- weil F2 nicht Teil dieses Auftrags ist. Dieser Baustein ist so
-- geschnitten, dass can_see_user() ihn später zusammensetzen kann,
-- ohne dass die Rekursion doppelt existiert.
--
-- SECURITY DEFINER ist nötig, weil die Policy profiles_select_own
-- den Zugriff auf das eigene Profil beschränkt, die Prüfung aber
-- die Sponsorenkette aufwärts lesen muss.

create or replace function public.is_ancestor_of(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive upline as (
    -- Startpunkt: der direkte Sponsor des Ziels, in derselben Org
    select p.sponsor_id as anc_id, p.org_id
    from public.profiles p
    where p.id = p_target
      and p.sponsor_id is not null
      and p.org_id = (select org_id from public.profiles where id = auth.uid())
    union all
    select p.sponsor_id, p.org_id
    from public.profiles p
    join upline u on p.id = u.anc_id
    where p.sponsor_id is not null
      and p.org_id = u.org_id
  ) cycle anc_id set is_cycle using cycle_path
  -- Kreiserkennung ueber die CYCLE-Klausel (PostgreSQL 14+, hier 17.6).
  -- Eine feste Tiefengrenze waere falsch: Sie wuerde legitime tiefe
  -- Genealogien abschneiden und dadurch stillschweigend falsche
  -- Ergebnisse liefern. CYCLE bricht nur bei echten Kreisen ab.
  select count(*) > 0 from upline where anc_id = auth.uid() and not is_cycle;
$$;

comment on function public.is_ancestor_of(uuid) is
  'Wahr, wenn auth.uid() in derselben Organisation oberhalb von p_target steht. Baustein fuer Sichtbarkeitspruefungen (F1).';

-- ============================================================
-- Teil 2: Planungsfunktionen, Fremdparameter entfernen
--
-- Der Parameter p_user war im gesamten Produktivpfad immer
-- auth.uid(), weil generate_daily_plan ihn aus v_user := auth.uid()
-- gefuellt hat. Ein Parameter, der stets den eigenen Nutzer
-- enthaelt, ist keine Funktionalitaet, sondern Angriffsflaeche.
-- Entfernen macht die Fehlbenutzung unmoeglich, statt sie
-- abzufangen.
--
-- Zusaetzlich SECURITY INVOKER: Die Funktionen lesen nur. Bei
-- einem Direktaufruf durch authenticated greift damit zusaetzlich
-- die RLS auf contacts.
--
-- Feinheit, die zwingend beachtet werden muss: Beim Aufruf aus
-- generate_daily_plan (bleibt DEFINER) ist current_user gleich
-- postgres, RLS greift dort also NICHT, auch nicht bei INVOKER.
-- Die Absicherung leistet in diesem Pfad allein der explizite
-- Filter owner_id = auth.uid(). Dieser Filter ist deshalb die
-- eigentliche Garantie und darf nie entfallen.
-- auth.uid() funktioniert in beiden Faellen, weil es die
-- JWT-Ansprueche der Sitzung liest und nicht die aktive Rolle.
-- ============================================================

drop function if exists public.plan_signal_fit_check(uuid, date);
drop function if exists public.plan_signal_next_step(uuid, date);
drop function if exists public.plan_signal_presentation(uuid, date);
drop function if exists public.plan_signal_follow_up(uuid, date);
drop function if exists public.plan_signal_reactivate(uuid, date);
drop function if exists public.plan_contact_state(uuid);

create or replace function public.plan_contact_state()
returns table (
  id uuid, name text, next_step text, next_step_due date,
  max_rank int, last_event_at timestamptz,
  presentation_sent_at timestamptz, presentation_viewed boolean,
  fit_check_done boolean, three_way_done boolean
)
language sql
stable
security invoker
set search_path = public
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
  where c.owner_id = auth.uid()   -- Die eigentliche Garantie, siehe Kopf
  group by c.id;
$$;

comment on function public.plan_contact_state() is
  'Pipeline-Zustand der EIGENEN Kontakte. Fremdparameter in F1 entfernt.';

create or replace function public.plan_signal_fit_check(p_date date)
returns table (contact_id uuid, mission_type text, title text, reason text, score int)
language sql stable security invoker set search_path = public
as $$
  select id, 'fit_check_next_step',
    '3-Way-Call mit ' || name || ' organisieren',
    'Fit Check ist abgeschlossen, jetzt entscheidet der nächste Schritt.',
    100
  from public.plan_contact_state()
  where fit_check_done and not three_way_done and max_rank < 60;
$$;

create or replace function public.plan_signal_next_step(p_date date)
returns table (contact_id uuid, mission_type text, title text, reason text, score int)
language sql stable security invoker set search_path = public
as $$
  select id, 'next_step_due',
    coalesce(next_step, 'Geplanten Schritt bei ' || name || ' erledigen'),
    case when next_step_due < p_date
      then 'Bei ' || name || ' seit ' || (p_date - next_step_due) || ' Tag(en) überfällig.'
      else 'Für heute bei ' || name || ' geplant.'
    end,
    case when next_step_due < p_date then 95 else 90 end
  from public.plan_contact_state()
  where next_step_due is not null and next_step_due <= p_date and max_rank < 70;
$$;

create or replace function public.plan_signal_presentation(p_date date)
returns table (contact_id uuid, mission_type text, title text, reason text, score int)
language sql stable security invoker set search_path = public
as $$
  select id, 'presentation_pending',
    'Bei ' || name || ' zur Präsentation nachfassen',
    'Präsentation vor ' || extract(day from now() - presentation_sent_at)::int ||
      ' Tagen gesendet, noch nicht angesehen.',
    80
  from public.plan_contact_state()
  where presentation_sent_at is not null
    and not presentation_viewed
    and presentation_sent_at < now() - interval '2 days'
    and max_rank < 60;
$$;

create or replace function public.plan_signal_follow_up(p_date date)
returns table (contact_id uuid, mission_type text, title text, reason text, score int)
language sql stable security invoker set search_path = public
as $$
  select id, 'follow_up_overdue',
    name || ' kontaktieren',
    'Seit ' || extract(day from now() - last_event_at)::int ||
      ' Tagen kein Kontakt, bleib präsent.',
    least(60 + extract(day from now() - last_event_at)::int, 75)
  from public.plan_contact_state()
  where last_event_at < now() - interval '7 days'
    and last_event_at >= now() - interval '14 days'
    and max_rank between 10 and 50;
$$;

create or replace function public.plan_signal_reactivate(p_date date)
returns table (contact_id uuid, mission_type text, title text, reason text, score int)
language sql stable security invoker set search_path = public
as $$
  select id, 'reactivate_contact',
    name || ' reaktivieren',
    'Seit ' || extract(day from now() - last_event_at)::int ||
      ' Tagen keine Aktivität, ein kurzes Lebenszeichen genügt.',
    50
  from public.plan_contact_state()
  where last_event_at < now() - interval '14 days' and max_rank < 60;
$$;

-- ============================================================
-- Teil 3: generate_daily_plan an die neuen Signaturen anpassen
--
-- Bleibt SECURITY DEFINER: Auf daily_plans und daily_plan_items
-- existiert bewusst keine INSERT-Policy, der Nutzer darf also
-- nicht selbst schreiben. Die Funktion ist der einzige Schreibweg.
-- Sie nimmt keinen Fremdparameter und ist damit nicht angreifbar.
--
-- Logik unveraendert gegenueber Migration 8, nur die Aufrufe.
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
  if v_user is null then
    raise exception 'AscendOS: Nicht angemeldet.';
  end if;

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
    select * from public.plan_signal_fit_check(p_date)
    union all select * from public.plan_signal_next_step(p_date)
    union all select * from public.plan_signal_presentation(p_date)
    union all select * from public.plan_signal_follow_up(p_date)
    union all select * from public.plan_signal_reactivate(p_date)
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

-- ============================================================
-- Teil 4: get_downline, Organisationsfilter und Berechtigung
--
-- Parameter bleibt, weil eine Teamleitung die Struktur einer
-- anderen Person sehen soll (Roadmap Phase 5).
--
-- Leere Rueckgabe statt Ausnahme bei fehlender Berechtigung:
-- Eine Ausnahme wuerde bestaetigen, dass die Kennung existiert.
-- Eine leere Menge ist von einer nicht existierenden Wurzel nicht
-- unterscheidbar und verraet damit nichts.
-- ============================================================

create or replace function public.get_downline(root_user_id uuid)
returns table (user_id uuid, depth int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_root_org uuid;
begin
  if auth.uid() is null then
    return; -- leere Menge
  end if;

  select org_id into v_root_org from public.profiles where id = root_user_id;
  if v_root_org is null then
    return; -- Wurzel existiert nicht: nicht unterscheidbar von "kein Zugriff"
  end if;

  -- Berechtigung ZUERST, damit die Rekursion bei fehlendem Zugriff
  -- gar nicht laeuft. Frueher Abbruch statt Filter am Ende.
  if not (
    root_user_id = auth.uid()
    or public.is_ancestor_of(root_user_id)
    or (public.is_super_admin() and v_root_org = public.current_org_id())
  ) then
    return; -- leere Menge, keine Ausnahme: verraet nicht, ob die Kennung existiert
  end if;

  return query
    with recursive downline as (
      select p.id as uid, 1 as lvl
      from public.profiles p
      where p.sponsor_id = root_user_id
        and p.org_id = v_root_org        -- Mandantengrenze, fehlte vor F1
      union all
      select p.id, d.lvl + 1
      from public.profiles p
      join downline d on p.sponsor_id = d.uid
      where p.org_id = v_root_org
    ) cycle uid set is_cycle using cycle_path
    -- Kreiserkennung, Begruendung siehe is_ancestor_of
    select d.uid, d.lvl from downline d where not d.is_cycle;
end;
$$;

comment on function public.get_downline(uuid) is
  'Downline einer Person. Seit F1 mit org_id-Filter und Berechtigungspruefung: Selbst, Upline oder super_admin derselben Organisation.';

-- ============================================================
-- Teil 5: coach_messages_today, Aufruferpruefung
--
-- Parameter bleibt, weil ein spaeterer Adminbereich Kontingente
-- je Nutzer anzeigen soll.
--
-- Hier ist eine Ausnahme richtig und keine leere Rueckgabe: Der
-- Wert steuert das Tageslimit im Coach. Eine stillschweigende
-- Null wuerde das Limit aushebeln.
-- ============================================================

create or replace function public.coach_messages_today(p_user uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AscendOS: Nicht angemeldet.';
  end if;

  if p_user <> auth.uid() then
    if not (
      public.is_super_admin()
      and exists (
        select 1 from public.profiles
        where id = p_user and org_id = public.current_org_id()
      )
    ) then
      raise exception 'AscendOS: Kein Zugriff auf fremde Nutzungsdaten.';
    end if;
  end if;

  return (
    select count(*)::int
    from public.coach_messages m
    join public.coach_convos c on c.id = m.convo_id
    where c.user_id = p_user
      and m.role = 'user'
      and m.created_at >= date_trunc('day', now())
  );
end;
$$;

-- ============================================================
-- Teil 6: track_usage, Aufruferpruefung
--
-- KORREKTUR gegenueber der ersten Fassung dieser Migration.
--
-- Die erste Fassung ging davon aus, track_usage habe keinen
-- Aufrufer. Das war falsch. Aufrufer ist der Trigger
-- log_contact_created, der in Migration 8 um
--   perform public.track_usage(new.owner_id, 'contact_created');
-- erweitert wurde. Der Trigger laeuft als SECURITY DEFINER unter
-- postgres, dort ist auth.uid() NULL, zum Beispiel in Tests, in
-- Migrationen und bei Aufrufen ueber service_role.
--
-- Eine harte Pruefung auf auth.uid() liess deshalb das Anlegen
-- eines Kontakts scheitern:
--   ERROR: AscendOS: Nicht angemeldet.
--   CONTEXT: track_usage <- log_contact_created
--
-- Zwei Aenderungen loesen das, ohne die Sicherheit zu senken:
--
-- 1. Die Eigentumspruefung greift nur, WENN eine Nutzersitzung
--    existiert. Ohne Sitzung ist der Aufrufer das System. Die
--    eigentliche Grenze sind die Ausfuehrungsrechte in Teil 9:
--    anon hat kein EXECUTE, also kann kein unangemeldeter
--    Aufrufer diesen Weg nutzen.
--
-- 2. WARNUNG statt AUSNAHME. Eine Nachverfolgungsfunktion darf
--    den Vorgang, den sie nachverfolgt, niemals abbrechen. Bei
--    einem Versuch fuer einen fremden Nutzer wird nichts
--    geschrieben und eine Warnung protokolliert. Der Kontakt
--    entsteht trotzdem.
--
-- Reichweite geprueft: Die Policy contacts_owner_all erzwingt
-- owner_id = auth.uid(). Ueber die API kann der Parameter also
-- nie abweichen. Die Pruefung ist zusaetzliche Tiefe, nicht die
-- Grenze.
-- ============================================================

create or replace function public.track_usage(p_user uuid, p_event text, p_meta jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nur bei bestehender Nutzersitzung pruefen, Begruendung im Kopf.
  if auth.uid() is not null
     and p_user <> auth.uid()
     and not public.is_super_admin() then
    raise warning 'AscendOS: track_usage fuer fremden Nutzer abgewiesen, nichts geschrieben.';
    return;
  end if;

  begin
    insert into public.usage_events (user_id, org_id, event_type, metadata)
    select p_user, org_id, p_event, p_meta
    from public.profiles where id = p_user;
  exception when others then
    null; -- Tracking darf nie eine Kernfunktion brechen
  end;
end;
$$;

comment on function public.track_usage(uuid, text, jsonb) is
  'Nachverfolgung. Aufrufer ist der Trigger log_contact_created. Bricht nie den nachverfolgten Vorgang ab.';

-- ============================================================
-- Teil 7: match_knowledge, search_path und ehrlicher Parameter
--
-- KRITISCH: Der Typ vector und der Operator <=> liegen im Schema
-- extensions. Ein auf public festgenagelter Pfad wuerde die
-- Funktion sofort zerstoeren. Korrekt ist public, extensions.
--
-- p_org_id sah wie eine Berechtigungsgrenze aus, war aber keine.
-- Die Trennung leistet die Policy knowledge_docs_select_approved.
-- Der Parameter erhaelt eine Pruefung, damit er haelt, was er
-- suggeriert. coach-chat uebergibt profile.org_id, also die
-- eigene Organisation: kein Bruch.
-- ============================================================

create or replace function public.match_knowledge(
  query_embedding extensions.vector(1536),
  p_org_id uuid,
  match_categories text[] default null,
  match_count int default 5,
  min_similarity float default 0.25
)
returns table (doc_id uuid, doc_title text, category text, content text, similarity float)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
begin
  if p_org_id is distinct from public.current_org_id()
     and not public.is_super_admin() then
    raise exception 'AscendOS: Kein Zugriff auf fremdes Organisationswissen.';
  end if;

  return query
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
end;
$$;

-- ============================================================
-- Teil 8: search_path bei den uebrigen Funktionen festnageln
--
-- Kein akuter Ausfall, aber Haertung. Bei
-- protect_profile_columns waere die Auswirkung gravierend: Die
-- Funktion setzt den Schutz vor Selbstbefoerderung durch und ruft
-- public.is_super_admin() auf. Ein manipulierbarer Suchpfad
-- wuerde diesen Schutz aushebeln.
--
-- Verhalten bleibt in allen drei Faellen unveraendert.
-- HINWEIS: set_updated_at wird auch von einem Trigger auf der
-- Tabelle products des Fremdprojekts genutzt. Das Festnageln des
-- Pfades aendert das Verhalten nicht.
-- ============================================================

alter function public.protect_profile_columns() set search_path = public;
alter function public.set_updated_at()          set search_path = public;
alter function public.event_phase_rank(text)    set search_path = public;

-- ============================================================
-- Teil 9: Ausfuehrungsrechte
--
-- Reihenfolge ist entscheidend: PUBLIC zuerst entziehen, dann
-- selektiv gewaehren. Ein Entzug von anon allein ist wirkungslos,
-- solange PUBLIC das Recht haelt. Genau daran ist [S-1] in
-- Migration 8 gescheitert.
--
-- ZWINGENDE AUSNAHME: current_org_id, is_super_admin und
-- current_user_role werden INNERHALB von RLS-Policies aufgerufen
-- (31, 19 und 1 Vorkommen). Eine Policy wird mit den Rechten der
-- abfragenden Rolle ausgewertet. Ohne EXECUTE fuer anon liefert
-- jede Abfrage dieser Rolle "permission denied for function"
-- statt eines leeren Ergebnisses. Diese drei behalten ihr Recht.
--
-- Trigger-Funktionen (handle_new_user, log_contact_created,
-- protect_profile_columns, set_updated_at) behalten ihre Rechte
-- ebenfalls. Sie sind nicht direkt aufrufbar: PL/pgSQL lehnt den
-- Direktaufruf einer Trigger-Funktion ab. Ein Entzug haette kein
-- Sicherheitsplus, koennte aber die Trigger-Ausfuehrung stoeren.
-- ============================================================

-- Vom Frontend genutzte RPC: nur authenticated und service_role
revoke execute on function public.check_achievements()                     from PUBLIC, anon;
revoke execute on function public.commit_daily_plan(uuid)                  from PUBLIC, anon;
revoke execute on function public.complete_journey_step(uuid)              from PUBLIC, anon;
revoke execute on function public.correct_pipeline_event(uuid)             from PUBLIC, anon;
revoke execute on function public.create_invite(text)                      from PUBLIC, anon;
revoke execute on function public.generate_daily_plan(date)                from PUBLIC, anon;
revoke execute on function public.update_mission_status(uuid, text, text)  from PUBLIC, anon;
revoke execute on function public.get_downline(uuid)                       from PUBLIC, anon;
revoke execute on function public.is_ancestor_of(uuid)                     from PUBLIC, anon;
revoke execute on function public.coach_messages_today(uuid)               from PUBLIC, anon;
revoke execute on function public.match_knowledge(extensions.vector, uuid, text[], int, float) from PUBLIC, anon;

grant execute on function public.check_achievements()                      to authenticated, service_role;
grant execute on function public.commit_daily_plan(uuid)                    to authenticated, service_role;
grant execute on function public.complete_journey_step(uuid)                to authenticated, service_role;
grant execute on function public.correct_pipeline_event(uuid)               to authenticated, service_role;
grant execute on function public.create_invite(text)                        to authenticated, service_role;
grant execute on function public.generate_daily_plan(date)                  to authenticated, service_role;
grant execute on function public.update_mission_status(uuid, text, text)    to authenticated, service_role;
grant execute on function public.get_downline(uuid)                         to authenticated, service_role;
grant execute on function public.is_ancestor_of(uuid)                       to authenticated, service_role;
grant execute on function public.coach_messages_today(uuid)                 to authenticated, service_role;
grant execute on function public.match_knowledge(extensions.vector, uuid, text[], int, float) to authenticated, service_role;

-- Planungsfunktionen: intern von generate_daily_plan genutzt.
-- authenticated bleibt erlaubt, weil ein Direktaufruf nach dem
-- Entfernen des Parameters nur eigene Daten liefern kann.
revoke execute on function public.plan_contact_state()          from PUBLIC, anon;
revoke execute on function public.plan_signal_fit_check(date)    from PUBLIC, anon;
revoke execute on function public.plan_signal_next_step(date)    from PUBLIC, anon;
revoke execute on function public.plan_signal_presentation(date) from PUBLIC, anon;
revoke execute on function public.plan_signal_follow_up(date)    from PUBLIC, anon;
revoke execute on function public.plan_signal_reactivate(date)   from PUBLIC, anon;

grant execute on function public.plan_contact_state()            to authenticated, service_role;
grant execute on function public.plan_signal_fit_check(date)      to authenticated, service_role;
grant execute on function public.plan_signal_next_step(date)      to authenticated, service_role;
grant execute on function public.plan_signal_presentation(date)   to authenticated, service_role;
grant execute on function public.plan_signal_follow_up(date)      to authenticated, service_role;
grant execute on function public.plan_signal_reactivate(date)     to authenticated, service_role;

-- validate_invite: laeuft ausschliesslich ueber die Edge Function
-- mit service_role. [S-1] aus Migration 8 wird hier wirksam
-- nachgezogen, weil jetzt auch PUBLIC entzogen wird.
revoke execute on function public.validate_invite(text) from PUBLIC, anon, authenticated;
grant  execute on function public.validate_invite(text) to service_role;

-- track_usage: schreibend, derzeit ohne Aufrufer.
revoke execute on function public.track_usage(uuid, text, jsonb) from PUBLIC, anon;
grant  execute on function public.track_usage(uuid, text, jsonb) to authenticated, service_role;

-- Policy-Helfer: Recht fuer anon MUSS bleiben, siehe Kopf dieses Teils.
-- Nur explizit bestaetigt, nicht veraendert.
grant execute on function public.current_org_id()    to anon, authenticated, service_role;
grant execute on function public.is_super_admin()    to anon, authenticated, service_role;
grant execute on function public.current_user_role() to anon, authenticated, service_role;

-- ############ 20260731000013_explicit_grants.sql ############
-- ============================================================
-- Migration 13: Rechte ausdruecklich vergeben statt erben
--
-- URSACHE B, bewiesen in Sprint 0.
--
-- Befund lokal:      25 Objekte in public ohne SELECT fuer authenticated
-- Befund Produktion:  0 Objekte ohne SELECT fuer authenticated
--
-- Warum der Unterschied. Die ACL von daily_plans in Produktion lautet
--   postgres=arwdDxtm/postgres  anon=arwdDxtm/postgres
--   authenticated=arwdDxtm/postgres  service_role=arwdDxtm/postgres
-- Das Suffix /postgres benennt den Erteiler. Die Rechte entstehen dort
-- nicht durch eine Migration, sondern als Nebenwirkung konfigurierter
-- Vorgabeprivilegien: in Produktion ist
--   alter default privileges for role postgres in schema public ...
-- gesetzt, und jede von postgres angelegte Tabelle erbt die Rechte.
--
-- ALTER DEFAULT PRIVILEGES wirkt PRO ERZEUGENDER ROLLE. Lokal greift
-- dieser Weg nicht, weil dort entweder keine Vorgabe fuer die
-- erzeugende Rolle konfiguriert ist oder die Migrationen von einer
-- anderen Rolle angewendet werden. Welche der beiden Varianten
-- zutrifft, wurde nicht weiter untersucht und ist fuer diese
-- Korrektur unerheblich: Eine ausdrueckliche Erteilung wirkt in
-- beiden Faellen.
--
-- Folge ohne diese Migration: Das Schema ist nicht portabel. Es
-- funktioniert nur in einer Umgebung, deren Vorgabeprivilegien
-- zufaellig passen. Betroffen ist nicht nur die Testsuite, sondern
-- jede Frontend-Abfrage einer lokalen Entwicklungsumgebung.
--
-- Wirkung in Produktion: keine. Die Rechte sind dort identisch
-- vorhanden, die Anweisungen sind dort folgenlos.
--
-- Sicherheit: anon erhaelt Rechte auf Tabellenebene, genau wie in
-- Produktion. Das ist unbedenklich, weil RLS auf allen Tabellen aktiv
-- ist und fuer anon geschlossen ausfaellt: auth.uid() ist NULL,
-- current_org_id() liefert NULL, und jede Policy-Bedingung wird
-- dadurch NULL und damit nicht wahr. Die Grenze ist RLS, nicht das
-- Tabellenrecht. In Sprint 0 geprueft.
-- ============================================================

-- ---------- Schema ----------

grant usage on schema public to anon, authenticated, service_role;

-- ---------- Bestehende Tabellen und Views ----------
--
-- "all tables" umfasst in PostgreSQL auch Views. Der Umfang der
-- Rechte entspricht dem Istzustand in Produktion, arwdDxtm.

grant all on all tables in schema public to anon, authenticated, service_role;

-- ---------- Kuenftige Tabellen und Views ----------
--
-- Bewusst OHNE "for role": die Vorgabe gilt dadurch fuer die Rolle,
-- die diese Migration anwendet. Genau das macht die Einstellung
-- portabel, denn jede Umgebung setzt sie fuer ihre eigene
-- Migrationsrolle.

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

-- ============================================================
-- AUSDRUECKLICH NICHT ENTHALTEN: Rechte auf Funktionen.
--
-- Migration 12 entzieht anon das Ausfuehrungsrecht auf neun
-- Funktionen, darunter get_downline, plan_contact_state und
-- track_usage. Ein pauschales
--   grant all on all functions in schema public to anon
-- wuerde genau diese Entzuege aufheben und die in F1 behobene Luecke
-- wieder oeffnen.
--
-- Dasselbe gilt fuer eine Vorgabe auf Funktionen. Funktionsrechte
-- werden ausschliesslich einzeln vergeben, wie in Migration 12 und
-- wie in der Security Baseline, Abschnitt 6, festgelegt.
--
-- Ebenfalls nicht enthalten: Sequenzen. Sie waren nicht Teil des
-- bewiesenen Befunds und sind daher nicht Gegenstand dieser
-- Korrektur.
-- ============================================================

-- ############ 20260801000014_user_progress_sponsor_policy.sql ############
-- ============================================================
-- Migration 14: Sponsor-Zweig der user_progress-Policy reparieren
--
-- BEFUND, bewiesen in Sprint 0 durch journey.test.sql, Pruefung 8:
--   have=0  want=3
--
-- Die Policy user_progress_select_own_or_sponsor lautet:
--   user_id = auth.uid()
--   or exists (select 1 from profiles p
--              where p.id = user_progress.user_id
--                and p.sponsor_id = auth.uid())
--
-- Der zweite Zweig liest `profiles`. Auf `profiles` existiert genau
-- eine SELECT-Policy:
--   id = auth.uid() or (is_super_admin() and org_id = current_org_id())
--
-- RLS gilt auch fuer Tabellenverweise INNERHALB eines
-- Policy-Ausdrucks. Ein Berater sieht in `profiles` daher nur seine
-- eigene Zeile. Die Unterabfrage sucht aber die Zeile des
-- Downline-Partners, findet sie nicht, und EXISTS ist immer falsch.
--
-- Folge: Der Sponsor-Zweig ist fuer jeden ausser super_admin TOTER
-- CODE. Ein Sponsor kann den Journey-Fortschritt seiner Firstline
-- nicht sehen, obwohl die Policy genau das erlauben soll. Das ist ein
-- Fehler im Produktivcode, nicht im Test.
--
-- Sichtbar wurde er nur, weil der View
-- firstline_journey_progress selbst aus profiles_public liest und
-- damit eine Zeile liefert, deren gezaehlter Fortschritt dann 0 ist.
-- Daher have=0 und nicht have=NULL.
--
-- KORREKTUR, minimal: Die Unterabfrage liest profiles_public statt
-- profiles. Dieser View hat kein security_invoker, laeuft also mit
-- den Rechten seines Eigentuemers und umgeht die RLS auf profiles.
-- Er traegt seine eigene Grenze `org_id = current_org_id()`.
--
-- Die Semantik bleibt unveraendert: direkter Sponsor, nicht die
-- gesamte Upline. Absichtlich NICHT is_ancestor_of aus Migration 12,
-- denn das wuerde die Sichtbarkeit auf die ganze Downline erweitern
-- und damit das Verhalten ueber die Korrektur hinaus aendern.
--
-- ACHTUNG fuer kuenftige Aenderungen: Diese Policy haengt jetzt davon
-- ab, dass profiles_public KEIN security_invoker hat. Wird das
-- gesetzt, ist der Sponsor-Zweig wieder toter Code, und zwar
-- lautlos. Der Testfall journey Pruefung 8 deckt das ab.
-- ============================================================

drop policy if exists user_progress_select_own_or_sponsor on public.user_progress;

create policy user_progress_select_own_or_sponsor
  on public.user_progress
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles_public p
      where p.id = user_progress.user_id
        and p.sponsor_id = auth.uid()
    )
  );

-- ============================================================
-- PRODUKTIONS-BOOTSTRAP: Chogan · Team Seyda · Inhalte · Codes
-- ============================================================

insert into public.organizations (id, name, settings)
values ('00000000-0000-0000-0000-000000000001', 'Chogan',
        '{"coach_daily_message_limit": 50}'::jsonb);

insert into public.teams (id, org_id, name)
values ('00000000-0000-0000-0000-000000000011',
        '00000000-0000-0000-0000-000000000001', 'Team Seyda');

insert into public.invites (code, org_id, team_id, sponsor_id, role, expires_at)
select
  upper(substring(replace(replace(replace(replace(
    encode(extensions.gen_random_bytes(8), 'base64'),
    '/', 'A'), '+', 'B'), '0', 'C'), 'O', 'D') from 1 for 10)),
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000011',
  null, 'super_admin', now() + interval '30 days'
from generate_series(1, 2);

-- Externe Tools (Generation 1) für Chogan / Team Seyda:
insert into public.external_tools
  (org_id, key, name, description, url, share_event_type, result_event_type, sort_order)
values
  ('00000000-0000-0000-0000-000000000001', 'waytomoon',
   'WayToMoon', 'Onboarding für neue Interessenten',
   'https://waytomoon.netlify.app',
   'waytomoon_sent', null, 1),
  ('00000000-0000-0000-0000-000000000001', 'presentation',
   'Firmenpräsentation', 'Präsentation für Interessenten',
   'https://mywaytomoon.netlify.app',
   'presentation_sent', 'presentation_viewed', 2),
  ('00000000-0000-0000-0000-000000000001', 'fitcheck',
   'Business Fit Check', 'Qualifizierung nach der Präsentation',
   'https://businessfitcheck.netlify.app',
   'fit_check_sent', 'fit_check_completed', 3);

-- KI-Agenten für Chogan (Router wählt; für den Nutzer EIN Coach).
-- Gemeinsame Regeln (Kontext-first, Handlung am Ende, Guardrails)
-- ergänzt die Edge Function zentral — hier steht nur die Spezialisierung.
insert into public.agents (org_id, key, name, system_prompt, retrieval_categories) values
  ('00000000-0000-0000-0000-000000000001', 'recruiting',
   'Recruiting Coach',
   'Du bist der Recruiting-Coach. Deine Spezialgebiete: Interessenten qualifizieren, Einwände behandeln, den Prozess Präsentation -> Business Fit Check -> 3-Way-Call -> Registrierung führen. Du kennst die Angst vor dem ersten Schritt und nimmst sie ernst, ohne Druck aufzubauen.',
   '{recruiting,einwaende,prozess}'),
  ('00000000-0000-0000-0000-000000000001', 'sales',
   'Sales Coach',
   'Du bist der Sales-Coach. Deine Spezialgebiete: Produkte, Kundengespräche, Duftpartys planen und nachbereiten, aus Kunden Stammkunden machen. Du verkaufst über Nutzen und Erlebnis, nie über Druck.',
   '{produkte,verkauf,duftparty}'),
  ('00000000-0000-0000-0000-000000000001', 'knowledge',
   'Knowledge Coach',
   'Du bist der Knowledge-Coach. Deine Spezialgebiete: Produkte, Vergütungsplan, Abläufe und Schulungsinhalte präzise erklären. Du antwortest nur auf Basis der Teamdokumente; fehlen sie, sagst du das klar.',
   '{produkte,verguetung,schulung,faq,prozess}');

-- ============================================================
-- Sprint 5: 7-Tage-Journey für Team Seyda (Inhalte = Daten)
-- ============================================================
insert into public.journeys (id, org_id, team_id, title, description)
values ('00000000-0000-0000-0000-000000000021',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000011',
        'Starte durch: Deine ersten 7 Tage',
        'Schritt für Schritt vom ersten Login zum ersten Recruiting-Gespräch.');

insert into public.journey_steps (journey_id, day_number, step_order, title, content_type, content) values
-- Tag 1
('00000000-0000-0000-0000-000000000021', 1, 1, 'Willkommen bei AscendOS', 'info',
 '{"body": "Schön, dass du da bist. AscendOS führt dich ab heute durch deinen Arbeitstag. Diese Woche gehen wir gemeinsam Schritt für Schritt — danach übernimmt dein täglicher Plan."}'),
('00000000-0000-0000-0000-000000000021', 1, 2, 'Profil vervollständigen', 'task',
 '{"body": "Ergänze unter Mehr dein Profilbild und deine Telefonnummer, damit dein Team dich erkennt.", "link": "/mehr", "cta": "Zum Profil"}'),
('00000000-0000-0000-0000-000000000021', 1, 3, 'WayToMoon öffnen', 'tool',
 '{"body": "WayToMoon ist unser Onboarding für Interessenten — schau es dir einmal selbst komplett an, damit du weißt, was deine Kontakte später sehen.", "tool_key": "waytomoon"}'),
('00000000-0000-0000-0000-000000000021', 1, 4, 'Teamgruppe beitreten', 'task',
 '{"body": "Tritt unserer Team-WhatsApp-Gruppe bei — den Link bekommst du von deinem Sponsor.", "cta": "Bin drin"}'),
('00000000-0000-0000-0000-000000000021', 1, 5, 'Sponsor kontaktieren', 'task',
 '{"body": "Schreib deinem Sponsor eine kurze Nachricht: Du bist gestartet und freust dich auf die erste Woche. Ihr vereinbart am besten direkt euren ersten Check-in."}'),
-- Tag 2
('00000000-0000-0000-0000-000000000021', 2, 1, 'Firmenpräsentation ansehen', 'tool',
 '{"body": "Sieh dir unsere Firmenpräsentation vollständig an — sie ist das Herzstück jedes Interessenten-Gesprächs.", "tool_key": "presentation"}'),
('00000000-0000-0000-0000-000000000021', 2, 2, 'Business Fit Check selbst machen', 'tool',
 '{"body": "Durchlaufe den Business Fit Check einmal selbst. So verstehst du, wie sich deine Interessenten dabei fühlen.", "tool_key": "fitcheck"}'),
-- Tag 3
('00000000-0000-0000-0000-000000000021', 3, 1, 'Social-Media-Grundlagen', 'info',
 '{"body": "Heute geht es um deinen Auftritt: authentisch, persönlich, ohne Werbeversprechen. Was wir posten — und was nie — findest du in der Team-Schulung. Frag Ascent nach unseren Social-Media-Regeln."}'),
('00000000-0000-0000-0000-000000000021', 3, 2, 'Ersten Beitrag planen', 'task',
 '{"body": "Plane einen persönlichen Beitrag über deinen Start — keine Produktwerbung, nur deine Geschichte."}'),
-- Tag 4
('00000000-0000-0000-0000-000000000021', 4, 1, 'Duftparty verstehen', 'info',
 '{"body": "Die Duftparty ist unser stärkstes Erlebnis-Format. Frag Ascent: \"Wie läuft eine Duftparty ab?\" — er erklärt dir den kompletten Ablauf aus unseren Team-Unterlagen."}'),
-- Tag 5
('00000000-0000-0000-0000-000000000021', 5, 1, 'Deine ersten Kontakte', 'task',
 '{"body": "Lege heute deine ersten drei Kontakte an: Menschen, denen du Chogan von Herzen zeigen würdest.", "link": "/kontakte/neu", "cta": "Kontakt anlegen"}'),
-- Tag 6
('00000000-0000-0000-0000-000000000021', 6, 1, 'Follow-ups verstehen', 'info',
 '{"body": "Der Erfolg liegt im Nachfassen. Ab morgen zeigt dir dein Daily Plan automatisch, wen du wann kontaktierst — heute lernst du das Prinzip: kurz, ehrlich, ohne Druck."}'),
('00000000-0000-0000-0000-000000000021', 6, 2, 'Erstes Follow-up senden', 'task',
 '{"body": "Melde dich bei einem deiner drei Kontakte mit einer persönlichen Nachricht. Dokumentiere es danach am Kontakt.", "link": "/kontakte", "cta": "Zu den Kontakten"}'),
-- Tag 7
('00000000-0000-0000-0000-000000000021', 7, 1, 'Dein erstes Recruiting-Gespräch', 'task',
 '{"body": "Wähle deinen wärmsten Kontakt und teile die Firmenpräsentation. Bereite dich mit Ascent vor: \"Bereite mich auf das Gespräch vor.\" Ab morgen übernimmt dein Daily Command Center."}');

-- ============================================================
-- Achievements: Meilensteine aus echten Daten (keine Punkte)
-- ============================================================
insert into public.achievements (org_id, key, title, description, icon, condition, sort_order) values
('00000000-0000-0000-0000-000000000001', 'startklar', 'Startklar',
 'Deine erste Woche ist abgeschlossen — du kennst unser System.', '🚀',
 '{"type": "journey_completed"}', 1),
('00000000-0000-0000-0000-000000000001', 'erster_kontakt', 'Erster Kontakt',
 'Deine Pipeline hat begonnen.', '🌱',
 '{"type": "event_count", "event_type": "contact_created", "count": 1}', 2),
('00000000-0000-0000-0000-000000000001', 'erstes_follow_up', 'Dranbleiber',
 'Dein erstes dokumentiertes Follow-up.', '📞',
 '{"type": "event_count", "event_type": "follow_up", "count": 1}', 3),
('00000000-0000-0000-0000-000000000001', 'erste_party', 'Gastgeber',
 'Deine erste Duftparty ist durchgeführt.', '🕯️',
 '{"type": "event_count", "event_type": "party_done", "count": 1}', 4),
('00000000-0000-0000-0000-000000000001', 'erster_kunde', 'Erster Kunde',
 'Jemand vertraut deiner Empfehlung.', '🤝',
 '{"type": "phase_count", "min_rank": 60, "count": 1}', 5),
('00000000-0000-0000-0000-000000000001', 'erster_partner', 'Erster Partner',
 'Dein erster Partner hat sich registriert.', '⭐',
 '{"type": "phase_count", "min_rank": 70, "count": 1}', 6),
('00000000-0000-0000-0000-000000000001', 'erste_firstline', 'Deine Firstline wächst',
 'Dein erster direkt gesponserter Partner ist in AscendOS.', '👥',
 '{"type": "firstline_count", "count": 1}', 7),
('00000000-0000-0000-0000-000000000001', 'erste_downline', 'Eine Downline entsteht',
 'Unter deiner Firstline wächst die nächste Ebene.', '🌳',
 '{"type": "downline_count", "count": 2}', 8),
('00000000-0000-0000-0000-000000000001', 'hundert_follow_ups', '100 Follow-ups',
 'Konsequenz zahlt sich aus: 100 dokumentierte Follow-ups.', '💯',
 '{"type": "event_count", "event_type": "follow_up", "count": 100}', 9);


-- ============================================================
-- FERTIG. Deine beiden Gründer-Codes (notieren!):
-- ============================================================
select code as GRUENDER_CODE, expires_at as GUELTIG_BIS
from public.invites where sponsor_id is null;
