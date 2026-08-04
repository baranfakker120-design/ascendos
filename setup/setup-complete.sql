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

-- ############ 20260802000015_identity_and_membership.sql ############
-- ============================================================
-- Migration 15, Sprint 2a: Identitaet und Mitgliedschaft trennen
--
-- Grundlage: F2 Teil 1, freigegeben am 25. Juli 2026.
-- Freigabe der Reihenfolge durch den Betreiber am 29. Juli 2026.
--
-- ZIEL
-- Eine Person kann mehreren Organisationen angehoeren. Rollen,
-- Berechtigungen, Team und Genealogie haengen an der MITGLIEDSCHAFT,
-- nicht an der Identitaet.
--
-- WARUM DAS BEZAHLBAR IST, erhoben am 29. Juli 2026:
--   - Nur DREI Policies lesen `profiles` direkt:
--       knowledge_docs_select_approved, journeys_select_member,
--       user_progress_select_own_or_sponsor
--   - Alle uebrigen 28 gehen ueber current_org_id(), current_user_role()
--     oder is_super_admin(). Diese drei Funktionen sind je ein Einzeiler.
--     Sie umzuschreiben lenkt alle Policies um, ohne eine anzufassen.
--   - profiles_username_key ist bereits UNIQUE. F2 FD-3 erfuellt.
--
-- WAS DIESE MIGRATION NICHT TUT, bewusst:
--   - Sie benennt `profiles` nicht um. Die Tabelle ist ab jetzt die
--     IDENTITAET. 13 Fremdschluessel zeigen darauf; ein Umbenennen
--     waere reine Churn ohne fachlichen Gewinn.
--   - Sie zeigt die operativen Fremdschluessel NICHT auf memberships um.
--     Begruendung in Abschnitt 0. Das ist Sprint 2b und braucht eine
--     Entscheidung des Betreibers.
-- ============================================================


-- ============================================================
-- 0. Entwurfsentscheidung, die dem Betreiber vorzulegen ist
--
-- Alle operativen Tabellen tragen BEREITS `user_id` UND `org_id`:
--   contacts(owner_id, org_id), coach_convos(user_id, org_id),
--   daily_plans(user_id, org_id), pipeline_events(created_by, org_id),
--   usage_events(user_id, org_id), knowledge_gaps(user_id, org_id)
--
-- Und die Policies pruefen bereits beides, Beispiel contacts_owner_all:
--   owner_id = auth.uid() AND org_id = current_org_id()
--
-- Das Paar (Person, Organisation) IST die Mitgliedschaft, adressiert
-- ueber den natuerlichen Schluessel statt ueber eine Ersatzkennung.
-- Fachlich erfuellt das F2 Teil 1.2 bereits: die Daten sind
-- organisationsbezogen.
--
-- Zwei Wege ab hier:
--
--   Weg 1, dieser: Operative Tabellen bleiben bei (user_id, org_id).
--     Die Mitgliedschaft ergaenzt das, was heute auf profiles liegt und
--     dort falsch liegt: Rolle, Team, Sponsor, Status, Land, Ziele.
--     Risiko gering, kein Datenumzug in 13 Tabellen.
--
--   Weg 2: 13 Fremdschluessel auf memberships(id) umlenken.
--     Referenzielle Strenge hoeher, Aufwand und Risiko deutlich hoeher.
--     Ein zusammengesetzter Fremdschluessel auf (identity_id, org_id)
--     ist NICHT moeglich, weil F2 FD-2 mehrere Mitgliedschaften je
--     Person und Organisation ueber die Zeit erlaubt und die
--     Eindeutigkeit deshalb nur partiell sein kann.
--
-- Diese Migration geht Weg 1 und laesst Weg 2 offen. Der Preis von
-- Weg 1 ist benannt: Es gibt keine Durchsetzung auf Datenbankebene,
-- dass der Eigentuemer eines Kontakts Mitglied der Organisation ist.
-- Durchgesetzt wird es in den Policies.
-- ============================================================


-- ============================================================
-- 1. Mitgliedschaft
-- ============================================================

create table if not exists public.memberships (
  id                    uuid primary key default gen_random_uuid(),

  -- KEIN kaskadierendes Loeschen. F2 Aenderung Ae6, verbindlich:
  -- Das Loeschen einer Identitaet darf keine Geschaeftsunterlagen
  -- mitreissen, die aufbewahrungspflichtig sind. Eine Identitaet wird
  -- anonymisiert, nicht entfernt.
  identity_id           uuid not null references public.profiles(id)      on delete restrict,
  org_id                uuid not null references public.organizations(id) on delete restrict,
  team_id               uuid not null references public.teams(id)         on delete restrict,

  -- Sponsor verweist auf eine MITGLIEDSCHAFT, nicht auf eine Identitaet.
  -- F2 Teil 1.5: Eine Person kann in Organisation A von X und in
  -- Organisation B von Y gesponsert sein.
  sponsor_membership_id uuid references public.memberships(id) on delete set null,

  -- 'leden' bewusst nicht: F2 Teil 2.6 fuehrt 'leader' als UEBERHOLT
  -- weiter, damit kein Bestandswert bricht. Neu vergeben wird er nicht.
  role                  text not null default 'berater'
                          check (role in ('super_admin','admin','berater','leader')),

  -- F2 Teil 1.4. 'suspended' ist bewusst von 'ended' getrennt: eine
  -- Sperre darf nicht als Ausscheiden gelten, weil das Genealogie und
  -- Provision veraendern wuerde.
  status                text not null default 'active'
                          check (status in ('pending','active','suspended','ended')),

  -- Rechtsraum an der Mitgliedschaft, nicht an der Identitaet.
  -- F3 Teil 8.1: Sprache folgt der Person, Zulaessigkeit folgt der
  -- Organisation und ihrem Markt.
  country               text,

  -- Ziele sind organisationsbezogene Vorgaben, nicht persoenliche
  -- Voreinstellungen. Faustregel F2 1.2.
  goals                 jsonb not null default '{}'::jsonb,

  joined_at             timestamptz not null default now(),
  left_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- F2 FD-2: mehrere Mitgliedschaften je Person und Organisation ueber die
-- Zeit sind erlaubt, damit ein Wiedereintritt die Historie nicht
-- ueberschreibt. Hoechstens EINE davon ist aktiv.
create unique index if not exists memberships_one_active_per_org
  on public.memberships (identity_id, org_id)
  where status = 'active';

create index if not exists memberships_identity_idx  on public.memberships (identity_id);
create index if not exists memberships_org_idx       on public.memberships (org_id);
create index if not exists memberships_sponsor_idx   on public.memberships (sponsor_membership_id);
create index if not exists memberships_team_idx      on public.memberships (team_id);

comment on table public.memberships is
  'Zugehoerigkeit einer Identitaet zu einer Organisation. Zentrale Einheit der Autorisierung (F2 Teil 1).';

create trigger memberships_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();


-- ============================================================
-- 2. Strukturregel: Sponsor nur innerhalb derselben Organisation
--
-- F2 Teil 1.5, wortwoertlich: Eine Beziehung ueber
-- Organisationsgrenzen ist kein Sonderfall, sondern ein Fehler. Sie
-- wuerde die Deckelung pro Linie und damit den Verguetungsplan
-- unberechenbar machen.
--
-- Als CHECK nicht abbildbar, weil zeilenuebergreifend. Daher Trigger.
-- ============================================================

create or replace function public.memberships_check_sponsor()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sponsor_org uuid;
begin
  if new.sponsor_membership_id is null then
    return new;
  end if;

  if new.sponsor_membership_id = new.id then
    raise exception 'AscendOS: Eine Mitgliedschaft kann nicht ihr eigener Sponsor sein.';
  end if;

  select org_id into v_sponsor_org
  from public.memberships where id = new.sponsor_membership_id;

  if v_sponsor_org is distinct from new.org_id then
    raise exception 'AscendOS: Sponsor und Mitglied muessen zur selben Organisation gehoeren.';
  end if;

  return new;
end;
$$;

create trigger memberships_sponsor_same_org
  before insert or update of sponsor_membership_id, org_id on public.memberships
  for each row execute function public.memberships_check_sponsor();


-- ============================================================
-- 3. Datenumzug der bestehenden Profile
--
-- Zwei Durchlaeufe, weil der Sponsor auf eine Mitgliedschaft zeigt,
-- die im ersten Durchlauf noch nicht existiert.
-- Idempotent ueber `on conflict do nothing` und das partielle Unique.
-- ============================================================

insert into public.memberships
  (identity_id, org_id, team_id, role, status, country, goals, joined_at, created_at)
select p.id, p.org_id, p.team_id, p.role, 'active', p.country, p.goals, p.created_at, p.created_at
from public.profiles p
where not exists (
  select 1 from public.memberships m
  where m.identity_id = p.id and m.org_id = p.org_id and m.status = 'active'
);

-- Zweiter Durchlauf: Genealogie von Profil- auf Mitgliedschaftsebene.
update public.memberships m
set sponsor_membership_id = sp.id
from public.profiles p
join public.memberships sp
  on sp.identity_id = p.sponsor_id
 and sp.org_id      = p.org_id
 and sp.status      = 'active'
where m.identity_id = p.id
  and m.org_id      = p.org_id
  and m.status      = 'active'
  and p.sponsor_id is not null
  and m.sponsor_membership_id is null;


-- ============================================================
-- 4. Die aktive Organisation
--
-- F2 Teil 1.3. Kernunterscheidung: Die aktive Organisation ist ein
-- SELEKTOR, keine Berechtigung. Sie sagt, WELCHE Mitgliedschaft
-- betrachtet wird, nicht OB sie zusteht. Die Gueltigkeit wird immer
-- serverseitig gegen die aktiven Mitgliedschaften geprueft.
--
-- Deshalb darf der Selektor vom Client kommen: der Client waehlt eine
-- Sichtweise, der Server entscheidet, ob sie ihm zusteht.
--
-- Auflösungsregel, vier Faelle in dieser Reihenfolge:
--   1. Selektor gesetzt und zeigt auf eine aktive Mitgliedschaft -> gilt
--   2. Selektor gesetzt, zeigt aber nicht darauf              -> ABWEISEN
--   3. Kein Selektor, genau eine aktive Mitgliedschaft        -> gilt
--   4. Kein Selektor, mehrere aktive Mitgliedschaften         -> ABWEISEN
--
-- Fall 4 ist die wichtigste Regel: bei Mehrdeutigkeit wird ABGEWIESEN,
-- nie geraten. Ein System, das "die erste" nimmt, erzeugt einen
-- mandantenuebergreifenden Zugriff, der nur bei bestimmten Sortierungen
-- auftritt und kaum reproduzierbar ist.
--
-- Abweisen heisst NULL. Jede Policy prueft `org_id = current_org_id()`,
-- und ein Vergleich mit NULL ist nicht wahr. Damit faellt das System
-- geschlossen aus.
--
-- Fall 3 stellt sicher, dass der heutige Zustand unveraendert laeuft:
-- alle bestehenden Nutzer haben genau eine Mitgliedschaft.
-- ============================================================

create or replace function public.active_membership_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_selektor uuid;
  v_treffer  uuid;
  v_anzahl   int;
begin
  if v_uid is null then
    return null;
  end if;

  -- Selektor aus dem Anfragekopf. Fehlt er oder ist er unlesbar,
  -- bleibt er NULL und Fall 3 oder 4 greift.
  begin
    v_selektor := nullif(
      (current_setting('request.headers', true)::json ->> 'x-ascendos-org'), ''
    )::uuid;
  exception when others then
    v_selektor := null;
  end;

  if v_selektor is not null then
    -- Fall 1 und 2
    select m.id into v_treffer
    from public.memberships m
    where m.identity_id = v_uid
      and m.org_id      = v_selektor
      and m.status      = 'active';
    return v_treffer;   -- NULL bedeutet abgewiesen, Fall 2
  end if;

  -- Fall 3 und 4
  select count(*) into v_anzahl
  from public.memberships m
  where m.identity_id = v_uid and m.status = 'active';

  if v_anzahl <> 1 then
    return null;        -- Fall 4: mehrdeutig, oder gar keine
  end if;

  select m.id into v_treffer
  from public.memberships m
  where m.identity_id = v_uid and m.status = 'active';
  return v_treffer;
end;
$$;

comment on function public.active_membership_id() is
  'Validierte aktive Mitgliedschaft. Selektor aus dem Kopf x-ascendos-org, serverseitig geprueft. Bei Mehrdeutigkeit NULL (F2 Teil 1.3).';


-- ============================================================
-- 5. Die drei Helferfunktionen umschreiben
--
-- NAMEN BLEIBEN. Das ist der Grund, warum diese Migration bezahlbar
-- ist: 28 der 31 Policies rufen diese Funktionen auf und bleiben
-- dadurch unveraendert gueltig. Nur ihre Bedeutung wechselt von
-- "Angabe am Profil" auf "Angabe der aktiven Mitgliedschaft".
-- ============================================================

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.org_id from public.memberships m
  where m.id = public.active_membership_id();
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.memberships m
  where m.id = public.active_membership_id();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select m.role = 'super_admin' from public.memberships m
     where m.id = public.active_membership_id()),
    false
  );
$$;

-- Neu, fuer Policies, die die Mitgliedschaft selbst brauchen.
create or replace function public.current_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.team_id from public.memberships m
  where m.id = public.active_membership_id();
$$;


-- ============================================================
-- 6. Genealogie auf Mitgliedschaften
--
-- Ersetzt die Fassungen aus Migration 12. Logik unveraendert,
-- einschliesslich der CYCLE-Klausel und der Berechtigungspruefung.
-- Geaendert ist nur die Grundlage: memberships statt profiles.
--
-- Die Signaturen bleiben (uuid), damit kein Aufrufer bricht. Uebergeben
-- wird weiterhin eine IDENTITAETSkennung, aufgeloest wird sie innerhalb
-- der aktiven Organisation. Damit bleibt check_achievements
-- unveraendert funktionsfaehig.
-- ============================================================

create or replace function public.is_ancestor_of(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive ziel as (
    select m.id, m.org_id
    from public.memberships m
    where m.identity_id = p_target
      and m.status = 'active'
      and m.org_id = public.current_org_id()
  ),
  upline as (
    select m.sponsor_membership_id as anc_id, m.org_id
    from public.memberships m
    join ziel z on z.id = m.id
    where m.sponsor_membership_id is not null
    union all
    select m.sponsor_membership_id, m.org_id
    from public.memberships m
    join upline u on m.id = u.anc_id
    where m.sponsor_membership_id is not null
      and m.org_id = u.org_id
  ) cycle anc_id set is_cycle using cycle_path
  select count(*) > 0
  from upline u
  where not u.is_cycle
    and u.anc_id = public.active_membership_id();
$$;

create or replace function public.get_downline(root_user_id uuid)
returns table (user_id uuid, depth int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_root_membership uuid;
  v_root_org        uuid;
begin
  if auth.uid() is null then
    return;
  end if;

  -- Wurzel innerhalb der aktiven Organisation aufloesen.
  select m.id, m.org_id into v_root_membership, v_root_org
  from public.memberships m
  where m.identity_id = root_user_id
    and m.status = 'active'
    and m.org_id = public.current_org_id();

  if v_root_membership is null then
    return;   -- nicht vorhanden oder fremde Organisation
  end if;

  -- Berechtigung ZUERST, damit die Rekursion bei fehlendem Zugriff
  -- gar nicht laeuft. Leere Menge statt Ausnahme: eine Ausnahme wuerde
  -- bestaetigen, dass die Kennung existiert.
  if not (
    root_user_id = auth.uid()
    or public.is_ancestor_of(root_user_id)
    or (public.is_super_admin() and v_root_org = public.current_org_id())
  ) then
    return;
  end if;

  return query
    with recursive downline as (
      select m.id as mid, m.identity_id as uid, 1 as lvl
      from public.memberships m
      where m.sponsor_membership_id = v_root_membership
        and m.org_id = v_root_org
        and m.status = 'active'
      union all
      select m.id, m.identity_id, d.lvl + 1
      from public.memberships m
      join downline d on m.sponsor_membership_id = d.mid
      where m.org_id = v_root_org
        and m.status = 'active'
    ) cycle mid set is_cycle using cycle_path
    select d.uid, d.lvl from downline d where not d.is_cycle;
end;
$$;


-- ============================================================
-- 7. Schutz der Mitgliedschaftsfelder
--
-- protect_profile_columns schuetzte role, org_id, team_id und
-- sponsor_id auf profiles. Diese Felder liegen jetzt auf memberships.
-- Der bestehende Trigger bleibt fuer den Uebergang, damit kein
-- Bestandsverhalten bricht; der neue schuetzt die Mitgliedschaft.
--
-- F2 Teil 2.2, Fussnote 16: Identitaetsdaten sind fuer KEINE
-- Mitgliedschaftsrolle aenderbar. Wer Name oder E-Mail aendern kann,
-- kann eine Identitaet uebernehmen. profiles bleibt daher auf
-- Selbstbearbeitung beschraenkt, wie bisher.
-- ============================================================

create or replace function public.protect_membership_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_super_admin() then
    return new;
  end if;

  if new.role     is distinct from old.role
     or new.org_id  is distinct from old.org_id
     or new.team_id is distinct from old.team_id
     or new.sponsor_membership_id is distinct from old.sponsor_membership_id
     or new.status  is distinct from old.status
     or new.identity_id is distinct from old.identity_id then
    raise exception 'AscendOS: Rolle, Organisation, Team, Sponsor und Status koennen nicht selbst geaendert werden.';
  end if;

  return new;
end;
$$;

create trigger memberships_protect_columns
  before update on public.memberships
  for each row execute function public.protect_membership_columns();


-- ============================================================
-- 8. Zeilenrechte auf memberships
--
-- Sichtbarkeit: eigene Mitgliedschaften, die eigene Downline, und
-- fuer super_admin die gesamte eigene Organisation.
-- Schreiben: ausschliesslich super_admin. Rollen- und
-- Rechtevergabe folgt in Sprint 3.
-- ============================================================

alter table public.memberships enable row level security;

create policy memberships_select_own_or_downline
  on public.memberships for select
  using (
    identity_id = auth.uid()
    or (
      org_id = public.current_org_id()
      and (
        public.is_super_admin()
        or public.is_ancestor_of(identity_id)
      )
    )
  );

-- Selbstbearbeitung der EIGENEN Mitgliedschaft.
--
-- Notwendig, weil F2 Teil 8.1 verlangt, dass ein Berater seine eigenen
-- Ziele setzt, und `goals` liegt auf der Mitgliedschaft. Ohne diese
-- Policy koennte er das nicht.
--
-- Die Spalten, die er NICHT aendern darf, schuetzt der Trigger
-- protect_membership_columns: role, org_id, team_id,
-- sponsor_membership_id, status und identity_id. Dasselbe Muster wie
-- bei profiles: die Policy laesst die ZEILE zu, der Trigger schuetzt
-- die FELDER.
--
-- Ohne diese Trennung wuerde ein Selbst-Update von RLS lautlos auf null
-- Zeilen gefiltert. Der Trigger feuerte nie, und ein Test, der die
-- Schutzmeldung erwartet, waere rot geworden, ohne dass ein Schutz
-- verletzt worden waere.
create policy memberships_update_own
  on public.memberships for update
  using      (identity_id = auth.uid())
  with check (identity_id = auth.uid());

create policy memberships_admin_write
  on public.memberships for all
  using (public.is_super_admin() and org_id = public.current_org_id())
  with check (public.is_super_admin() and org_id = public.current_org_id());


-- ============================================================
-- 9. Ausfuehrungsrechte, Muster aus der Security Baseline
--
-- PUBLIC zuerst entziehen, dann selektiv gewaehren. Ein Entzug von
-- anon allein ist wirkungslos, solange PUBLIC das Recht haelt.
--
-- ZWINGEND: current_org_id, current_user_role, is_super_admin und
-- active_membership_id werden INNERHALB von RLS-Policies aufgerufen.
-- Eine Policy wird mit den Rechten der abfragenden Rolle ausgewertet.
-- Ohne EXECUTE fuer anon liefert jede Abfrage dieser Rolle
-- "permission denied for function" statt eines leeren Ergebnisses.
-- Diese vier behalten ihr Recht.
-- ============================================================

grant execute on function public.active_membership_id() to anon, authenticated, service_role;
grant execute on function public.current_org_id()       to anon, authenticated, service_role;
grant execute on function public.current_user_role()    to anon, authenticated, service_role;
grant execute on function public.is_super_admin()       to anon, authenticated, service_role;
grant execute on function public.current_team_id()      to anon, authenticated, service_role;

revoke execute on function public.is_ancestor_of(uuid) from PUBLIC, anon;
grant  execute on function public.is_ancestor_of(uuid) to authenticated, service_role;

revoke execute on function public.get_downline(uuid) from PUBLIC, anon;
grant  execute on function public.get_downline(uuid) to authenticated, service_role;

grant select on public.memberships to authenticated;
grant all    on public.memberships to service_role;


-- ============================================================
-- 10. Was in Sprint 2b folgt, ausdruecklich noch offen
--
--   a) handle_new_user: zwei Wege bei der Einladung. Neue Identitaet
--      plus Mitgliedschaft, oder NUR Mitgliedschaft, wenn die Person
--      bereits eine Identitaet hat. F2 Teil 1.7. Ohne diesen Schritt
--      entstehen Doppelidentitaeten, die nachtraeglich nur unter
--      Datenverlust zusammenzufuehren sind.
--   b) create_invite und validate_invite auf Mitgliedschaften.
--   c) Die drei Policies, die profiles direkt lesen.
--   d) profiles_public: Mitgliederliste je Organisation, Spalte role
--      entfaellt (F2 Aenderung Ae2).
--   e) Entscheidung zu Weg 1 gegen Weg 2 aus Abschnitt 0.
--   f) Frontend: Kopf x-ascendos-org setzen, sobald mehr als eine
--      Mitgliedschaft moeglich ist.
--
-- Bis dahin laeuft der Bestand unveraendert: jeder Nutzer hat genau
-- eine aktive Mitgliedschaft, Fall 3 der Aufloesungsregel greift, und
-- current_org_id() liefert denselben Wert wie zuvor.
-- ============================================================

-- ############ 20260803000016_registration_and_invites.sql ############
-- ============================================================
-- Migration 16, Sprint 2b: Registrierung und Einladungen auf
-- Mitgliedschaften umstellen
--
-- ZWINGENDE AUSLIEFERUNGSREGEL
--
-- Migration 15 darf NIEMALS ohne Migration 16 auf Produktion.
--
-- Begruendung: handle_new_user schreibt im Bestand ausschliesslich in
-- `profiles`. Nach Migration 15 entstuende bei einer Neuregistrierung
-- also KEIN Mitgliedschaftsdatensatz. active_membership_id() waere
-- NULL, current_org_id() waere NULL, und jede Policy fiele geschlossen
-- aus. Das Konto waere angelegt und funktionslos.
--
-- Bei sechs offenen Einladungen ist das keine theoretische Gefahr.
-- Beide Migrationen gehen in EINER Auslieferung raus.
-- ============================================================


-- ============================================================
-- 1. invites.role um 'admin' erweitern
--
-- F2 Teil 2 fuehrt die Rolle `admin` ein. Der Bestand erlaubt in
-- invites.role nur super_admin, leader und berater. Ein Admin waere
-- damit nicht einladbar.
--
-- `leader` bleibt enthalten, weil F2 Teil 2.6 den Wert als UEBERHOLT
-- weiterfuehrt, damit kein Bestandsdatensatz bricht.
-- ============================================================

alter table public.invites drop constraint if exists invites_role_check;

alter table public.invites add constraint invites_role_check
  check (role in ('super_admin','admin','berater','leader'));


-- ============================================================
-- 2. Registrierung: Identitaet UND Mitgliedschaft
--
-- F2 Teil 1.7, erster Weg: Die eingeladene Person hat noch keine
-- Identitaet. Es entsteht eine Identitaet UND eine Mitgliedschaft.
--
-- Zur Vorhaltung in `profiles`: org_id, team_id, sponsor_id und role
-- werden WEITERHIN gefuellt. Sie sind NOT NULL, und Frontend sowie
-- coach-chat lesen `profiles.*` und verwenden profile.org_id. Diese
-- Spalten sind ab jetzt eine SPIEGELUNG der aktiven Mitgliedschaft,
-- nicht die Wahrheit. Die Wahrheit steht in memberships.
--
-- Das ist bewusst ein Uebergangszustand, nicht der Endzustand. Ihn
-- aufzuloesen erfordert Aenderungen an coach-chat und am Frontend und
-- gehoert deshalb in einen eigenen, testbaren Schritt (Sprint 2c).
-- Solange die Spiegelung besteht, darf sie NUR hier und in
-- redeem_invite geschrieben werden.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite   public.invites;
  v_code     text;
  v_username text;
  v_sponsor_membership uuid;
begin
  v_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  if v_code = '' then
    raise exception 'AscendOS: Registrierung ist nur mit Einladungscode möglich.';
  end if;

  select * into v_invite
  from public.invites
  where code = v_code
  for update; -- sperrt den Invite gegen parallele Einloesung

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
  -- Benutzername bleibt GLOBAL eindeutig, an der Identitaet. F2 FD-3.
  if exists (select 1 from public.profiles where username = v_username) then
    raise exception 'AscendOS: Dieser Benutzername ist bereits vergeben.';
  end if;

  -- Identitaet
  insert into public.profiles
    (id, org_id, team_id, sponsor_id, role, first_name, last_name, username, language)
  values (
    new.id,
    v_invite.org_id,     -- Spiegelung, siehe Kopf
    v_invite.team_id,    -- Spiegelung
    v_invite.sponsor_id, -- Spiegelung
    v_invite.role,       -- Spiegelung
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''), 'Unbekannt'),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''), ''),
    v_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'language', ''), 'de')
  );

  -- Sponsor der Einladung ist eine IDENTITAETSkennung. Sie wird auf die
  -- aktive Mitgliedschaft derselben Person in DERSELBEN Organisation
  -- aufgeloest. F2 Teil 1.5: Genealogie ist organisationsbezogen.
  if v_invite.sponsor_id is not null then
    select m.id into v_sponsor_membership
    from public.memberships m
    where m.identity_id = v_invite.sponsor_id
      and m.org_id      = v_invite.org_id
      and m.status      = 'active';
  end if;

  -- Mitgliedschaft
  insert into public.memberships
    (identity_id, org_id, team_id, sponsor_membership_id, role, status)
  values (new.id, v_invite.org_id, v_invite.team_id, v_sponsor_membership,
          v_invite.role, 'active');

  update public.invites
  set used_by = new.id, used_at = now()
  where id = v_invite.id;

  return new;
end;
$$;


-- ============================================================
-- 3. Zusaetzliche Mitgliedschaft fuer eine BESTEHENDE Identitaet
--
-- F2 Teil 1.7, zweiter Weg. Dieser Weg existierte bisher nicht, und er
-- ist der Grund, warum ohne ihn Doppelidentitaeten desselben Menschen
-- entstehen, die sich nachtraeglich nur unter Datenverlust
-- zusammenfuehren lassen.
--
-- Er laeuft NICHT ueber handle_new_user: Wer bereits eine Identitaet
-- hat, hat bereits ein Auth-Konto. Ein zweiter Auth-Insert findet nicht
-- statt. Die Person meldet sich an und loest den Code ein.
--
-- SICHERHEITSHINWEIS aus F2 Teil 1.7: Dieser Weg darf niemals
-- verraten, ob eine E-Mail bereits registriert ist. Das ist hier
-- erfuellt, weil die Funktion eine Anmeldung VORAUSSETZT. Sie sagt
-- nichts ueber fremde Konten.
--
-- Identitaetsdaten werden NICHT angetastet. F2 Teil 5, Fussnote 16.
-- ============================================================

create or replace function public.redeem_invite(invite_code text)
returns table (org_id uuid, org_name text, membership_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_invite public.invites;
  v_code   text;
  v_sponsor_membership uuid;
  v_new_membership     uuid;
begin
  if v_uid is null then
    raise exception 'AscendOS: Nicht angemeldet.';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'AscendOS: Kein Profil für diesen Nutzer gefunden.';
  end if;

  v_code := upper(trim(coalesce(invite_code, '')));
  if v_code = '' then
    raise exception 'AscendOS: Kein Einladungscode angegeben.';
  end if;

  select * into v_invite
  from public.invites
  where code = v_code
  for update;

  if v_invite.id is null then
    raise exception 'AscendOS: Dieser Einladungscode existiert nicht.';
  end if;
  if v_invite.used_at is not null then
    raise exception 'AscendOS: Dieser Einladungscode wurde bereits verwendet.';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'AscendOS: Dieser Einladungscode ist abgelaufen.';
  end if;

  -- Hoechstens EINE aktive Mitgliedschaft je Organisation. F2 FD-2.
  -- Das partielle Unique wuerde es ebenfalls abweisen; die ausdrueckliche
  -- Pruefung liefert eine verstaendliche Meldung statt eines
  -- Datenbankfehlers.
  if exists (
    select 1 from public.memberships m
    where m.identity_id = v_uid and m.org_id = v_invite.org_id and m.status = 'active'
  ) then
    raise exception 'AscendOS: Du gehörst dieser Organisation bereits an.';
  end if;

  if v_invite.sponsor_id is not null then
    select m.id into v_sponsor_membership
    from public.memberships m
    where m.identity_id = v_invite.sponsor_id
      and m.org_id      = v_invite.org_id
      and m.status      = 'active';
  end if;

  insert into public.memberships
    (identity_id, org_id, team_id, sponsor_membership_id, role, status)
  values (v_uid, v_invite.org_id, v_invite.team_id, v_sponsor_membership,
          v_invite.role, 'active')
  returning id into v_new_membership;

  update public.invites
  set used_by = v_uid, used_at = now()
  where id = v_invite.id;

  return query
    select o.id, o.name, v_new_membership
    from public.organizations o
    where o.id = v_invite.org_id;
end;
$$;

comment on function public.redeem_invite(text) is
  'Bestehende Identitaet tritt einer weiteren Organisation bei. Erzeugt NUR eine Mitgliedschaft, keine Identitaet (F2 Teil 1.7).';


-- ============================================================
-- 4. create_invite aus der aktiven Mitgliedschaft speisen
--
-- Bisher las die Funktion Rolle, Organisation und Team aus `profiles`.
-- Ab jetzt aus der aktiven Mitgliedschaft: eine Person kann in
-- Organisation A einladen duerfen und in B nicht.
--
-- `sponsor_id` und `created_by` in `invites` bleiben
-- IDENTITAETSkennungen, weil die Tabelle auf profiles verweist. Die
-- Aufloesung auf die Mitgliedschaft geschieht beim Einloesen, in
-- handle_new_user und redeem_invite.
-- ============================================================

create or replace function public.create_invite(invite_role text default 'berater')
returns table (invite_code text, invite_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership public.memberships;
  v_code text;
begin
  select * into v_membership
  from public.memberships
  where id = public.active_membership_id();

  if v_membership.id is null then
    raise exception 'AscendOS: Keine aktive Mitgliedschaft für diesen Nutzer.';
  end if;

  if invite_role <> 'berater' and v_membership.role <> 'super_admin' then
    raise exception 'AscendOS: Nur Super-Admins können Admin- oder Leader-Einladungen erstellen.';
  end if;

  -- 10 Zeichen, gut vorlesbar (keine 0/O, 1/I)
  v_code := upper(
    substring(replace(replace(replace(replace(
      encode(gen_random_bytes(8), 'base64'),
      '/', 'A'), '+', 'B'), '0', 'C'), 'O', 'D')
    from 1 for 10)
  );

  insert into public.invites (code, org_id, team_id, sponsor_id, role, created_by)
  values (v_code, v_membership.org_id, v_membership.team_id,
          v_membership.identity_id, invite_role, v_membership.identity_id);

  return query
    select i.code, i.expires_at from public.invites i where i.code = v_code;
end;
$$;


-- ============================================================
-- 5. Die zwei Policies, die profiles direkt lesen
--
-- Beide enthielten dieselbe Unterabfrage:
--   team_id = (select team_id from profiles where id = auth.uid())
--
-- Sie liest die EIGENE Zeile und war daher nicht von dem Fehler aus
-- Migration 14 betroffen. Sie liest aber das Profil, und das Team liegt
-- ab jetzt an der Mitgliedschaft. Ersetzt durch current_team_id() aus
-- Migration 15: eine Funktion statt einer Unterabfrage, und die
-- richtige Quelle.
--
-- Die dritte Policy, user_progress_select_own_or_sponsor, wurde bereits
-- in Migration 14 auf profiles_public umgestellt und bleibt unberuehrt.
-- ============================================================

drop policy if exists knowledge_docs_select_approved on public.knowledge_docs;

create policy knowledge_docs_select_approved
  on public.knowledge_docs for select
  using (
    org_id = public.current_org_id()
    and (
      (
        status = 'approved'
        and (valid_until is null or valid_until > now())
        and (team_id is null or team_id = public.current_team_id())
      )
      or public.is_super_admin()
    )
  );

drop policy if exists journeys_select_member on public.journeys;

create policy journeys_select_member
  on public.journeys for select
  using (
    org_id = public.current_org_id()
    and (team_id is null or team_id = public.current_team_id())
    and is_active
  );


-- ============================================================
-- 6. profiles_public aus Mitgliedschaften speisen
--
-- Spaltenliste und Reihenfolge bleiben identisch, damit `create or
-- replace view` moeglich ist und firstline_journey_progress
-- unveraendert weiterlaeuft.
--
-- Quelle der org-bezogenen Angaben ist ab jetzt die aktive
-- Mitgliedschaft. sponsor_id wird von der Sponsor-MITGLIEDSCHAFT auf
-- deren Identitaetskennung zurueckgerechnet, damit die Bedeutung der
-- Spalte gleich bleibt.
--
-- Kein security_invoker, bewusst und unveraendert: Der View ist die
-- Mitgliederliste und muss die auf das eigene Profil beschraenkte
-- Policy erweitern. Er traegt stattdessen seine eigene Grenze
-- `org_id = current_org_id()`. Fuer anon faellt sie geschlossen aus,
-- weil current_org_id() dann NULL ist. In Sprint 0 geprueft.
--
-- OFFEN, F2 Aenderung Ae2: Die Spalte `role` soll entfallen, damit ein
-- Berater den Betreiber nicht org-weit identifizieren kann. Das
-- erfordert DROP und CREATE statt REPLACE, und daran haengen
-- firstline_journey_progress sowie die Policy
-- user_progress_select_own_or_sponsor. Deshalb ein eigener Schritt in
-- Sprint 2c, nicht hier.
-- ============================================================

create or replace view public.profiles_public as
  select
    p.id,
    m.org_id,
    m.team_id,
    sp.identity_id as sponsor_id,
    m.role,
    p.first_name,
    p.last_name,
    p.username,
    p.avatar_url
  from public.profiles p
  join public.memberships m
    on m.identity_id = p.id
   and m.status = 'active'
   and m.org_id = public.current_org_id()
  left join public.memberships sp
    on sp.id = m.sponsor_membership_id;


-- ============================================================
-- 7. Ausfuehrungsrechte, Muster aus der Security Baseline
-- ============================================================

revoke execute on function public.redeem_invite(text) from PUBLIC, anon;
grant  execute on function public.redeem_invite(text) to authenticated, service_role;

-- create_invite behaelt seine bisherigen Rechte, die Signatur ist
-- unveraendert. Zur Sicherheit ausdruecklich gesetzt.
revoke execute on function public.create_invite(text) from PUBLIC, anon;
grant  execute on function public.create_invite(text) to authenticated, service_role;


-- ============================================================
-- 8. Was in Sprint 2c folgt, ausdruecklich noch offen
--
--   a) Spiegelung in `profiles` aufloesen: org_id, team_id, sponsor_id
--      und role dort entfernen. Erfordert Aenderungen an coach-chat
--      (liest profile.org_id) und am Frontend.
--   b) profiles_public ohne `role`, F2 Aenderung Ae2. Erfordert DROP
--      und CREATE samt firstline_journey_progress und der Policy
--      user_progress_select_own_or_sponsor.
--   c) Frontend: Kopf x-ascendos-org setzen. Erst notwendig, sobald
--      eine Identitaet mehr als eine aktive Mitgliedschaft hat.
--      Vorher greift Fall 3 der Aufloesungsregel.
--   d) Entwurfsentscheidung Weg 1 gegen Weg 2 aus Migration 15,
--      Abschnitt 0: bleiben die 13 Fremdschluessel auf profiles?
-- ============================================================

-- ############ 20260804000017_mirror_sync_and_public_view.sql ############
-- ============================================================
-- Migration 17, Sprint 2c: Sprint 2 abschliessen
--
-- Zwei Punkte, beide gehoeren logisch zu Sprint 2:
--   1. Die Spiegelung in `profiles` driftfrei machen
--   2. profiles_public ohne `role`, F2 Aenderung Ae2
--
-- ARCHITEKTURENTSCHEIDUNG, hier festgeschrieben
--
-- `profiles.org_id`, `team_id`, `sponsor_id` und `role` BLEIBEN
-- bestehen. Sie sind ab Migration 16 eine SPIEGELUNG der aktiven
-- Mitgliedschaft. Die Wahrheit steht in `memberships`.
--
-- Begruendung gegen ein Entfernen: Der Spiegel wird an sieben Stellen
-- gelesen, in drei Auslieferungseinheiten:
--   Frontend  src/shared/auth/AuthProvider.tsx  (select *)
--   Frontend  src/app/router.tsx                (profile.role, Adminwache)
--   Frontend  src/features/more/MorePage.tsx    (org_id, team_id, sponsor_id)
--   Edge      coach-chat                        (profile.org_id, 6 Stellen; profile.role)
--   Edge      ingest-knowledge                  (profile.org_id, 2 Stellen)
--
-- Ein Entfernen erforderte einen abgestimmten Ausroll von Datenbank,
-- zwei Edge Functions und dem Frontend. Ein uebersehener Leser sperrt
-- alle Nutzer aus. F2 Teil 1.2 verlangt EINE Wahrheitsquelle und keine
-- Drift; es verlangt NICHT, dass die Spalte physisch verschwindet.
--
-- Diese Migration erfuellt die Anforderung durch Synchronisation:
-- memberships schreibt, profiles folgt automatisch. Drift ist damit
-- ausgeschlossen.
--
-- BEDINGUNG FUER DAS SPAETERE ENTFERNEN, damit es nicht vergessen wird:
-- Sobald alle sieben Leser auf `memberships` oder `profiles_public`
-- umgestellt sind, entfaellt der Spiegel samt Trigger. Das ist ein
-- eigener, testbarer Schritt und kein Sprint-2-Gegenstand.
-- ============================================================


-- ============================================================
-- 1. Der Schutztrigger muss die Synchronisation zulassen
--
-- protect_profile_columns schuetzt genau die vier Spiegelspalten gegen
-- Selbstaenderung. Ein Synchronisationstrigger wuerde daran scheitern.
--
-- Der Schutz DARF NICHT fallen: src/app/router.tsx bewacht die
-- Adminseite ueber `profile.role`. Koennte ein Nutzer diese Spalte
-- selbst setzen, oeffnete sich die Oberflaeche, auch wenn die Datenbank
-- die Handlungen weiterhin abweist. Das waere eine Rechteausweitung in
-- der Darstellung.
--
-- Loesung: ein transaktionslokales Kennzeichen, das ausschliesslich die
-- Synchronisationsfunktion setzt. Ein Nutzer kann es nicht setzen: Er
-- muesste set_config in DERSELBEN Transaktion aufrufen wie das UPDATE,
-- und PostgREST fuehrt je Anfrage genau eine Transaktion aus, in die
-- kein zweiter Aufruf einzuschieben ist.
-- ============================================================

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Synchronisation aus memberships, siehe sync_profile_mirror.
  if coalesce(current_setting('ascendos.mirror_sync', true), '') = 'on' then
    return new;
  end if;

  if public.is_super_admin() then
    return new;
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


-- ============================================================
-- 2. Synchronisation memberships -> profiles
--
-- Richtung ist eindeutig: memberships ist die Wahrheit, profiles folgt.
-- Nur die AKTIVE Mitgliedschaft spiegelt. Eine beendete oder gesperrte
-- Mitgliedschaft laesst den Spiegel unveraendert; die Spalten sind
-- NOT NULL und muessen einen Wert behalten.
--
-- Bei mehreren aktiven Mitgliedschaften spiegelt die zuletzt
-- geschriebene. Das ist bewusst und unschaedlich, weil der Spiegel
-- ausschliesslich der Darstellung dient und die Autorisierung
-- ueber active_membership_id() laeuft, die bei Mehrdeutigkeit abweist.
-- ============================================================

create or replace function public.sync_profile_mirror()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sponsor_identity uuid;
begin
  if new.status <> 'active' then
    return new;
  end if;

  if new.sponsor_membership_id is not null then
    select sp.identity_id into v_sponsor_identity
    from public.memberships sp where sp.id = new.sponsor_membership_id;
  end if;

  perform set_config('ascendos.mirror_sync', 'on', true);

  update public.profiles p
  set org_id     = new.org_id,
      team_id    = new.team_id,
      role       = new.role,
      sponsor_id = v_sponsor_identity
  where p.id = new.identity_id
    and (p.org_id, p.team_id, p.role, p.sponsor_id)
        is distinct from (new.org_id, new.team_id, new.role, v_sponsor_identity);

  perform set_config('ascendos.mirror_sync', 'off', true);

  return new;
end;
$$;

-- AFTER, damit die Mitgliedschaft bereits geschrieben ist und ein
-- Verweis auf new.id in einer Unterabfrage aufloesbar bleibt.
create trigger memberships_sync_mirror
  after insert or update of org_id, team_id, role, sponsor_membership_id, status
  on public.memberships
  for each row execute function public.sync_profile_mirror();


-- ============================================================
-- 3. Einmalige Nachfuehrung
--
-- Nach Migration 15 stimmt der Spiegel, weil dort AUS profiles
-- migriert wurde. Diese Anweisung ist die Absicherung fuer den Fall,
-- dass zwischen 15 und 17 eine Mitgliedschaft geaendert wurde.
-- Idempotent durch die is-distinct-from-Bedingung.
-- ============================================================

do $$
begin
  perform set_config('ascendos.mirror_sync', 'on', true);

  update public.profiles p
  set org_id     = m.org_id,
      team_id    = m.team_id,
      role       = m.role,
      sponsor_id = sp.identity_id
  from public.memberships m
  left join public.memberships sp on sp.id = m.sponsor_membership_id
  where m.identity_id = p.id
    and m.status = 'active'
    and (p.org_id, p.team_id, p.role, p.sponsor_id)
        is distinct from (m.org_id, m.team_id, m.role, sp.identity_id);

  perform set_config('ascendos.mirror_sync', 'off', true);
end $$;


-- ============================================================
-- 4. profiles_public ohne `role`, F2 Aenderung Ae2
--
-- Zweck: Ein Berater soll den Betreiber nicht organisationsweit
-- identifizieren koennen. Der View liefert die Mitgliederliste an alle
-- Angemeldeten der Organisation; die Rolle gehoert nicht dazu.
--
-- Geprueft, dass niemand die Spalte liest:
--   src/features/more/MorePage.tsx liest aus profiles_public nur
--   first_name, last_name und id. `profile.role` dort stammt aus dem
--   AuthProvider, also aus `profiles`, nicht aus diesem View.
--
-- Eine Spalte laesst sich nicht per CREATE OR REPLACE entfernen. Es
-- braucht DROP und CREATE, und daran haengen zwei Objekte:
--   firstline_journey_progress liest profiles_public
--   user_progress_select_own_or_sponsor (Migration 14) liest es ebenfalls
--
-- Reihenfolge daher: Policy, abhaengiger View, View, dann rueckwaerts.
-- ============================================================

drop policy if exists user_progress_select_own_or_sponsor on public.user_progress;
drop view  if exists public.firstline_journey_progress;
drop view  if exists public.profiles_public;

create view public.profiles_public as
  select
    p.id,
    m.org_id,
    m.team_id,
    sp.identity_id as sponsor_id,
    p.first_name,
    p.last_name,
    p.username,
    p.avatar_url
  from public.profiles p
  join public.memberships m
    on m.identity_id = p.id
   and m.status = 'active'
   and m.org_id = public.current_org_id()
  left join public.memberships sp
    on sp.id = m.sponsor_membership_id;

comment on view public.profiles_public is
  'Mitgliederliste der aktiven Organisation. OHNE Spalte role (F2 Ae2). Bewusst kein security_invoker: der View muss die auf das eigene Profil beschraenkte Policy erweitern und traegt stattdessen seine eigene Grenze org_id = current_org_id(), die fuer anon geschlossen ausfaellt.';

-- WORTGETREU aus dem Bestand wiederhergestellt, am 29. Juli 2026 aus
-- pg_get_viewdef ausgelesen.
--
-- ACHTUNG, hier lag ein Fehler in meinem ersten Entwurf: Ich hatte den
-- View aus dem Gedaechtnis mit SECHS Spalten nachgebildet und dabei
-- journey_title, current_day und total_days weggelassen sowie username
-- durch last_name ersetzt. Genau current_day und total_days tragen die
-- Fortschrittsanzeige. Die Nachbildung haette sie zerstoert.
--
-- Geaendert gegenueber dem Bestand: NICHTS. Der View liest
-- profiles_public und verwendet dessen Spalte `role` nicht, ist also
-- mit der neuen Fassung ohne role unveraendert vertraeglich.
create view public.firstline_journey_progress as
  select
    p.id                as user_id,
    p.first_name,
    p.username,
    j.id                as journey_id,
    j.title             as journey_title,
    count(s.id)         as total_steps,
    count(up.step_id)   as completed_steps,
    coalesce(
      min(s.day_number) filter (where up.step_id is null),
      max(s.day_number) + 1
    )                   as current_day,
    max(s.day_number)   as total_days
  from public.profiles_public p
  join public.journeys j
    on j.org_id = p.org_id
   and (j.team_id is null or j.team_id = p.team_id)
   and j.is_active
  join public.journey_steps s on s.journey_id = j.id
  left join public.user_progress up on up.step_id = s.id and up.user_id = p.id
  where p.sponsor_id = auth.uid()
  group by p.id, p.first_name, p.username, j.id, j.title;

alter view public.firstline_journey_progress set (security_invoker = true);

-- Unveraendert aus Migration 14 wiederhergestellt, einschliesslich der
-- dortigen Korrektur: Die Unterabfrage liest profiles_public und nicht
-- profiles, weil letzteres RLS-beschraenkt ist und der Sponsor-Zweig
-- sonst toter Code waere.
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

grant select on public.profiles_public          to anon, authenticated;
grant select on public.firstline_journey_progress to anon, authenticated;


-- ============================================================
-- 5. Was Sprint 2 damit abschliesst
--
--   Migration 15  Identitaet und Mitgliedschaft, Aufloesungsregel,
--                 Genealogie, Schutz, Zeilenrechte
--   Migration 16  Registrierung mit beiden Wegen, redeem_invite,
--                 create_invite, zwei Policies, invites.role
--   Migration 17  Spiegel driftfrei, profiles_public ohne role
--
-- OFFEN und ausdruecklich NICHT Sprint 2:
--   - Spiegel entfernen, sobald alle sieben Leser umgestellt sind
--   - Weg 2 aus Migration 15 Abschnitt 0: die 13 Fremdschluessel auf
--     memberships(id) umlenken. Weg 1 ist umgesetzt und dokumentiert
-- ============================================================

-- ############ 20260805000018_gamification_foundation.sql ############
-- ============================================================
-- Migration 18, Sprint 4: Fundament des Gamification-Systems
--
-- SETZT MIGRATIONEN 15 BIS 17 VORAUS. Ohne `memberships` schlaegt
-- diese Migration fehl -- absichtlich, statt eine Uebergangsloesung
-- fuer den alten Stand einzubauen (Vorgabe des Betreibers vom
-- 31. Juli 2026: keine technischen Schulden).
--
-- LEITSATZ: Kataloge sind Daten, keine Konstanten im Code.
-- Ein neuer Rang, ein anderer Punktwert, eine neue Season, ein
-- anderer Auszahlungsbetrag ist ein Datensatz -- keine Auslieferung.
-- Das ist die wortwoertliche Vorgabe: "Die Punktewerte duerfen nicht
-- fest im Code stehen."
--
-- VERBINDLICHE REGELN, die hier strukturell durchgesetzt werden:
--   1. AP gehoeren zur MITGLIEDSCHAFT (ap_ledger.membership_id)
--   2. Die 100 Euro gehoeren zur IDENTITAET und koennen NIE zweimal
--      entstehen (payouts UNIQUE (identity_id, kind))
--   3. Das System zahlt NIEMALS selbst aus. Es erzeugt einen Anspruch;
--      ein Mensch bestaetigt (payouts.confirmed_paid_at)
--   4. Rollen bleiben unveraendert -- memberships.role wird NICHT
--      angefasst (Vorgabe: "Rollenmodell bleibt unveraendert")
--   5. Raenge und Rahmen sind oeffentlich, Rollen nicht
-- ============================================================


-- ============================================================
-- 1. Gepufferte AP-Summe an der Mitgliedschaft
--
-- Warum ein gepufferter Wert und nicht immer eine Aggregation ueber
-- das Register: Bestenlisten und die Rangermittlung lesen diesen Wert
-- bei JEDEM Seitenaufruf. Eine Summierung ueber ein wachsendes
-- Register waere dort der erste Engpass.
--
-- Die Wahrheit bleibt das Register (ap_ledger). Dieser Wert ist eine
-- Projektion, per Trigger gepflegt und mit ap_recalculate() jederzeit
-- nachrechenbar.
--
-- Nicht von protect_membership_columns betroffen: jener Trigger
-- schuetzt role, org_id, team_id, sponsor_membership_id, status und
-- identity_id -- ap_total ist bewusst nicht darunter, weil es kein
-- Identitaets- oder Berechtigungsmerkmal ist.
-- ============================================================

alter table public.memberships
  add column if not exists ap_total integer not null default 0;

create index if not exists memberships_ap_total_idx
  on public.memberships (org_id, ap_total desc)
  where status = 'active';

comment on column public.memberships.ap_total is
  'Gepufferte Summe aus ap_ledger. Wahrheit ist das Register; mit ap_recalculate() nachrechenbar.';


-- ============================================================
-- 2. Seasons
--
-- Von Anfang an vorhanden, auch wenn Sprint 4 nur eine Season kennt.
-- Nachtraeglich eingefuegt waere jede Zeile in ap_rules, cosmetic_items
-- und ap_ledger ohne Season-Bezug -- und damit nicht rueckwirkend
-- zuordenbar.
-- ============================================================

create table if not exists public.seasons (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete restrict,
  key        text not null,
  label      text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

comment on table public.seasons is
  'Zeitabschnitte fuer Punktesaetze, Rahmen, Titel und Belohnungen.';


-- ============================================================
-- 3. Punkteregeln -- die Antwort auf "welche Aktivitaet bringt wie
--    viele AP", als DATEN
--
-- `source_kind` erlaubt bewusst ZWEI Quellen:
--   'pipeline_event'  Geschaeftsereignisse (Kontakt, Follow-up,
--                     Praesentation, Party, Kunde ...) -- 14 Typen
--   'usage_event'     Nutzungsereignisse (app_opened, plan_committed,
--                     journey_step_completed ...) -- 6 Typen
--
-- Damit ist auch die spaetere Streak-Belohnung (app_opened) ohne
-- Codeaenderung konfigurierbar, genau wie verlangt.
--
-- `event_type` ist ABSICHTLICH nicht per Fremdschluessel an die
-- CHECK-Liste von pipeline_events gebunden: neue Ereignisarten sollen
-- ohne Migration Punkte tragen koennen.
--
-- Zeitliche Gueltigkeit (valid_from/valid_until) statt Ueberschreiben:
-- eine Aenderung des Punktwerts darf die Vergangenheit nicht
-- umschreiben. Das Register haelt fest, welche Regel damals galt.
-- ============================================================

create table if not exists public.ap_rules (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete restrict,
  source_kind text not null check (source_kind in ('pipeline_event','usage_event','manual')),
  event_type  text not null,
  ap          integer not null default 0,
  season_id   uuid references public.seasons(id) on delete set null,
  valid_from  timestamptz not null default now(),
  valid_until timestamptz,
  is_active   boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Hoechstens EINE aktive Regel je Organisation, Quelle, Ereignisart
-- und Season. Verhindert, dass ein Ereignis versehentlich doppelt
-- bepunktet wird, weil zwei Regeln gleichzeitig greifen.
create unique index if not exists ap_rules_one_active
  on public.ap_rules (org_id, source_kind, event_type, coalesce(season_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_active;

create index if not exists ap_rules_lookup_idx
  on public.ap_rules (org_id, source_kind, event_type) where is_active;

create trigger ap_rules_updated_at
  before update on public.ap_rules
  for each row execute function public.set_updated_at();

comment on table public.ap_rules is
  'Zuordnung Ereignisart -> Punktwert. Frei konfigurierbar, keine Werte im Code.';


-- ============================================================
-- 4. Punkteregister -- fortschreibend, nachrechenbar, korrigierbar
--
-- Warum ein Register und kein blosser Zaehler:
--   - Die 100 Euro haengen daran. Ein Zaehler ohne Herkunft ist nicht
--     pruefbar.
--   - `pipeline_events` kennt den Typ 'correction'. AP muessen also
--     rueckholbar sein -- als GEGENBUCHUNG, nicht als Loeschung.
--   - Die Anzeige "+25 AP" braucht eine Quelle.
--   - ap_total ist jederzeit daraus neu berechenbar.
--
-- `on delete restrict` auf die Mitgliedschaft: Punktehistorie ist ein
-- Geschaeftsvorfall, sinngemaess zu F2 Aenderung Ae6.
-- ============================================================

create table if not exists public.ap_ledger (
  id              uuid primary key default gen_random_uuid(),
  membership_id   uuid not null references public.memberships(id) on delete restrict,
  delta           integer not null,
  reason          text not null,
  rule_id         uuid references public.ap_rules(id) on delete set null,
  source_kind     text not null check (source_kind in ('pipeline_event','usage_event','manual','correction')),
  -- Bewusst OHNE Fremdschluessel: die Quelle kann pipeline_events ODER
  -- usage_events sein. Ein Fremdschluessel auf beide gleichzeitig ist
  -- nicht darstellbar; die Herkunft steht in source_kind.
  source_event_id uuid,
  season_id       uuid references public.seasons(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- IDEMPOTENZ: je Quellereignis und Regel genau eine Buchung. Ein
-- erneut ausgeloester Trigger kann keine zweite Gutschrift erzeugen.
create unique index if not exists ap_ledger_once_per_event_rule
  on public.ap_ledger (source_event_id, rule_id)
  where source_event_id is not null and rule_id is not null;

create index if not exists ap_ledger_membership_idx
  on public.ap_ledger (membership_id, created_at desc);

comment on table public.ap_ledger is
  'Fortschreibendes Punkteregister. Korrekturen sind Gegenbuchungen, keine Loeschungen.';


-- ============================================================
-- 5. Rangkatalog
--
-- Als Tabelle, nicht als Enum oder Konstante: "Diese Werte sollen
-- spaeter leicht anpassbar sein" und "Neue Raenge" ohne Migration.
--
-- `payout_cents` und `payout_kind` liegen HIER, nicht im Code: damit
-- ist die 100-Euro-Belohnung an den Rang Team Leader gebunden, aber
-- Betrag und Schwelle bleiben konfigurierbar. Kein 30000 und kein
-- 10000 steht irgendwo fest.
-- ============================================================

create table if not exists public.ranks (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete restrict,
  key          text not null,
  label        text not null,
  threshold_ap integer not null check (threshold_ap >= 0),
  frame_asset  text,
  payout_cents integer check (payout_cents is null or payout_cents > 0),
  payout_kind  text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, key),
  -- Zwei Raenge auf derselben Schwelle waeren mehrdeutig.
  unique (org_id, threshold_ap),
  -- Ein Auszahlungsbetrag ohne Art (oder umgekehrt) waere unvollstaendig.
  check ((payout_cents is null) = (payout_kind is null))
);

create trigger ranks_updated_at
  before update on public.ranks
  for each row execute function public.set_updated_at();

comment on table public.ranks is
  'Rangkatalog: Schwelle, Rahmen und optionale Einmalbelohnung. Frei anpassbar.';


-- ============================================================
-- 6. Kosmetische Inhalte -- EIN Katalog fuer alles
--
-- Rahmen, Titel, Sticker und Eventobjekte in einer Tabelle, nach dem
-- Muster, das `achievements` im Bestand bereits verwendet. Damit
-- braucht ein neuer Titel, ein neuer Rahmen oder eine neue Season
-- keine neue Tabelle.
--
-- `unlock_condition` nutzt dieselbe jsonb-Form wie
-- `achievements.condition` -- die vorhandene Regelmaschine wird
-- erweitert, nicht verdoppelt.
--
-- BEKANNTE GRENZE, bewusst so: Besitz haengt an der MITGLIEDSCHAFT,
-- konsequent zur bestaetigten Regel "AP gehoeren zur Mitgliedschaft".
-- Ein Titel wie "Founder" koennte fachlich zur Identitaet gehoeren --
-- die Frage ist offen. Falls gewuenscht, ist das eine ERGAENZENDE
-- Tabelle `identity_cosmetics` mit demselben Aufbau, kein Umbau.
-- ============================================================

create table if not exists public.cosmetic_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete restrict,
  kind             text not null check (kind in ('frame','title','badge','event_object')),
  key              text not null,
  label            text not null,
  asset_path       text,
  season_id        uuid references public.seasons(id) on delete set null,
  -- Gehoert dieser Gegenstand zu einem Rang? Dann wird er beim
  -- Erreichen automatisch freigeschaltet.
  rank_key         text,
  unlock_condition jsonb,
  sort_order       integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (org_id, kind, key)
);

create index if not exists cosmetic_items_rank_idx
  on public.cosmetic_items (org_id, rank_key) where rank_key is not null;

comment on table public.cosmetic_items is
  'Katalog aller kosmetischen Inhalte: Rahmen, Titel, Sticker, Eventobjekte. Season-faehig.';

create table if not exists public.membership_cosmetics (
  membership_id uuid not null references public.memberships(id) on delete restrict,
  item_id       uuid not null references public.cosmetic_items(id) on delete cascade,
  -- Absichtlich verdoppelt aus cosmetic_items: nur so ist die Regel
  -- "hoechstens ein ausgeruesteter Gegenstand JE ART" als partieller
  -- Index durchsetzbar. Ein Index kann nicht auf eine andere Tabelle
  -- greifen. Wird vom Trigger unten konsistent gehalten.
  kind          text not null check (kind in ('frame','title','badge','event_object')),
  unlocked_at   timestamptz not null default now(),
  is_equipped   boolean not null default false,
  primary key (membership_id, item_id)
);

create unique index if not exists membership_cosmetics_one_equipped_per_kind
  on public.membership_cosmetics (membership_id, kind)
  where is_equipped;

create index if not exists membership_cosmetics_membership_idx
  on public.membership_cosmetics (membership_id);


-- ============================================================
-- 7. Auszahlungsansprueche
--
-- DAS WICHTIGSTE ELEMENT DIESER MIGRATION.
--
-- `unique (identity_id, kind)` macht eine Doppelauszahlung
-- STRUKTURELL unmoeglich -- auf Datenbankebene, nicht in
-- Anwendungslogik, die man vergessen oder umgehen kann.
--
-- An der IDENTITAET, nicht an der Mitgliedschaft: F2 FD-2 erlaubt
-- Wiedereintritt, der eine NEUE Mitgliedschaft erzeugt. Laege der
-- Anspruch an der Mitgliedschaft, wuerde Austritt und Wiedereintritt
-- eine zweite Auszahlung ausloesen. Genau das ist ausgeschlossen.
--
-- ZWEI GETRENNTE ZEITPUNKTE, bewusst:
--   entitled_at        das System erkennt den Anspruch (automatisch)
--   confirmed_paid_at  ein MENSCH bestaetigt die Zahlung (manuell)
-- Eine automatische Geldbewegung, ausgeloest von einem Punktestand,
-- waere eine Haftung. Das System zahlt nicht.
--
-- `on delete restrict`: aufbewahrungspflichtiger Geschaeftsvorfall,
-- F2 Aenderung Ae6.
-- ============================================================

create table if not exists public.payouts (
  id                        uuid primary key default gen_random_uuid(),
  identity_id               uuid not null references public.profiles(id) on delete restrict,
  kind                      text not null,
  amount_cents              integer not null check (amount_cents > 0),
  currency                  text not null default 'EUR',
  entitled_at               timestamptz not null default now(),
  confirmed_paid_at         timestamptz,
  confirmed_by              uuid references public.profiles(id) on delete set null,
  -- Nur Nachweis, welche Mitgliedschaft den Anspruch ausgeloest hat.
  -- Nicht die Grundlage der Einmaligkeit -- die ist identity_id.
  awarded_for_membership_id uuid references public.memberships(id) on delete set null,
  note                      text,
  created_at                timestamptz not null default now(),
  unique (identity_id, kind)
);

comment on table public.payouts is
  'Auszahlungsansprueche. UNIQUE(identity_id, kind) garantiert Einmaligkeit ueber Austritt und Wiedereintritt hinweg. Das System zahlt NICHT selbst aus.';


-- ============================================================
-- 8. Berater des Monats
-- ============================================================

create table if not exists public.monthly_awards (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete restrict,
  -- Erster Tag des Monats, als Kennzeichen des Zeitraums.
  period        date not null,
  place         integer not null check (place between 1 and 3),
  membership_id uuid not null references public.memberships(id) on delete restrict,
  ap_in_period  integer not null,
  created_at    timestamptz not null default now(),
  unique (org_id, period, place),
  -- Dieselbe Person kann nicht zwei Plaetze belegen.
  unique (org_id, period, membership_id)
);

comment on table public.monthly_awards is
  'Monatliche Auszeichnung, Plaetze 1 bis 3. Kein Rang.';


-- ============================================================
-- 9. Punktevergabe aus Ereignissen
--
-- EIN Trigger fuer beide Faelle. Das ist moeglich, weil
-- `correct_pipeline_event()` im Bestand eine Korrektur als NEUES
-- Ereignis vom Typ 'correction' anlegt, mit
-- payload.corrected_event_type -- das Original bleibt stehen. Eine
-- Korrektur ist damit fuer diesen Trigger einfach ein weiteres
-- Ereignis, das eine Gegenbuchung erzeugt.
--
-- Doppelkorrektur ist bereits dort ausgeschlossen; hier greift
-- zusaetzlich das partielle Unique auf (source_event_id, rule_id).
--
-- WICHTIG: `created_by` statt `auth.uid()`. Der Trigger
-- `log_contact_created` schreibt Ereignisse OHNE Nutzersitzung -- das
-- hat in Sprint 0 bereits `track_usage` zum Absturz gebracht. Aus
-- diesem Fehler gelernt.
-- ============================================================

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
begin
  if TG_TABLE_NAME = 'pipeline_events' then
    v_identity := new.created_by; v_org := new.org_id;
    v_event_type := new.event_type; v_source_kind := 'pipeline_event';
  elsif TG_TABLE_NAME = 'usage_events' then
    v_identity := new.user_id; v_org := new.org_id;
    v_event_type := new.event_type; v_source_kind := 'usage_event';
  else
    return new;
  end if;

  -- Systemereignis ohne Zuordnung: keine Punkte, kein Fehler.
  if v_identity is null or v_org is null then return new; end if;

  select m.id into v_membership
  from public.memberships m
  where m.identity_id = v_identity and m.org_id = v_org and m.status = 'active';

  -- Keine aktive Mitgliedschaft: keine Punkte. Bewusst still, damit
  -- ein Ereignis nie am Punktesystem scheitert.
  if v_membership is null then return new; end if;

  -- ---------- Korrektur: Gegenbuchung ----------
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

  -- ---------- Normalfall ----------
  select * into v_rule from public.ap_rules r
  where r.org_id = v_org and r.source_kind = v_source_kind
    and r.event_type = v_event_type and r.is_active
    and r.valid_from <= now()
    and (r.valid_until is null or r.valid_until > now())
  limit 1;

  -- Keine Regel oder Wert 0: nichts buchen. So bleibt ein
  -- unkonfiguriertes System funktionsfaehig, es vergibt nur nichts.
  if v_rule.id is null or v_rule.ap = 0 then return new; end if;

  insert into public.ap_ledger
    (membership_id, delta, reason, rule_id, source_kind, source_event_id, season_id)
  values (v_membership, v_rule.ap, v_event_type,
          v_rule.id, v_source_kind, new.id, v_rule.season_id)
  on conflict do nothing;

  return new;
end;
$$;

create trigger pipeline_events_award_ap
  after insert on public.pipeline_events
  for each row execute function public.ap_award_from_event();

create trigger usage_events_award_ap
  after insert on public.usage_events
  for each row execute function public.ap_award_from_event();


-- ============================================================
-- 10. Register wirkt auf die gepufferte Summe, Rang und Anspruch
--
-- Reihenfolge im Trigger ist bewusst: erst Summe, dann Kosmetik,
-- dann Auszahlungsanspruch. Der Anspruch entsteht als LETZTES, damit
-- er auf einem bereits konsistenten Stand beruht.
-- ============================================================

create or replace function public.ap_apply_to_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total    integer;
  v_org      uuid;
  v_identity uuid;
  v_rank     record;
begin
  update public.memberships
  set ap_total = ap_total + new.delta
  where id = new.membership_id
  returning ap_total, org_id, identity_id into v_total, v_org, v_identity;

  if v_org is null then return new; end if;

  -- Rangbezogene Kosmetik freischalten. `kind` setzt der eigene
  -- Trigger membership_cosmetics_kind_sync.
  insert into public.membership_cosmetics (membership_id, item_id, kind)
  select new.membership_id, ci.id, ci.kind
  from public.cosmetic_items ci
  join public.ranks r on r.org_id = ci.org_id and r.key = ci.rank_key
  where ci.org_id = v_org and ci.is_active
    and ci.rank_key is not null and r.is_active
    and r.threshold_ap <= v_total
  on conflict (membership_id, item_id) do nothing;

  -- Auszahlungsanspruch. Das UNIQUE (identity_id, kind) plus
  -- ON CONFLICT DO NOTHING ist die Einmaligkeitsgarantie:
  -- strukturell, nicht durch Anwendungslogik.
  --
  -- Es entsteht ausschliesslich ein ANSPRUCH. confirmed_paid_at bleibt
  -- leer, bis ein Mensch bestaetigt.
  for v_rank in
    select * from public.ranks
    where org_id = v_org and is_active
      and payout_cents is not null and threshold_ap <= v_total
  loop
    insert into public.payouts
      (identity_id, kind, amount_cents, awarded_for_membership_id, note)
    values (v_identity, v_rank.payout_kind, v_rank.payout_cents, new.membership_id,
            'Automatisch erkannt beim Erreichen von ' || v_rank.label)
    on conflict (identity_id, kind) do nothing;
  end loop;

  return new;
end;
$$;

create trigger ap_ledger_apply_total
  after insert on public.ap_ledger
  for each row execute function public.ap_apply_to_total();


-- ============================================================
-- 11. Hilfsfunktionen
-- ============================================================

/** Haelt das verdoppelte `kind` in membership_cosmetics konsistent.
 *  Ein Index kann nicht auf eine andere Tabelle greifen -- deshalb
 *  liegt `kind` dort gespiegelt und wird hier gesetzt, nie von Hand. */
create or replace function public.membership_cosmetics_sync_kind()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select ci.kind into new.kind from public.cosmetic_items ci where ci.id = new.item_id;
  if new.kind is null then
    raise exception 'AscendOS: Unbekannter kosmetischer Gegenstand.';
  end if;
  return new;
end;
$$;

create trigger membership_cosmetics_kind_sync
  before insert or update of item_id on public.membership_cosmetics
  for each row execute function public.membership_cosmetics_sync_kind();

/** Rang zu einem Punktestand. Rein, ohne Sitzungsbezug -- damit auch
 *  fuer Bestenlisten und Vorschauen nutzbar. */
create or replace function public.rank_for_ap(p_org_id uuid, p_ap integer)
returns table (key text, label text, threshold_ap integer, frame_asset text, sort_order integer)
language sql
stable
set search_path = public
as $$
  select r.key, r.label, r.threshold_ap, r.frame_asset, r.sort_order
  from public.ranks r
  where r.org_id = p_org_id and r.is_active and r.threshold_ap <= p_ap
  order by r.threshold_ap desc
  limit 1;
$$;

/** Naechste Schwelle. Liefert NULL beim hoechsten Rang -- der Aufrufer
 *  zeigt dann keinen Fortschritt zur naechsten Stufe, sondern den
 *  Endstand. */
create or replace function public.next_rank_for_ap(p_org_id uuid, p_ap integer)
returns table (key text, label text, threshold_ap integer)
language sql
stable
set search_path = public
as $$
  select r.key, r.label, r.threshold_ap
  from public.ranks r
  where r.org_id = p_org_id and r.is_active and r.threshold_ap > p_ap
  order by r.threshold_ap asc
  limit 1;
$$;

/** Neuberechnung der gepufferten Summe aus dem Register.
 *  Pruefwerkzeug und Reparatur -- nur fuer Super-Admins, weil es einen
 *  abweichenden Puffer stillschweigend ueberschreibt. */
create or replace function public.ap_recalculate(p_membership_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_sum integer;
begin
  if not public.is_super_admin() then
    raise exception 'AscendOS: Nur Super-Admins koennen Punkte neu berechnen.';
  end if;
  if not exists (select 1 from public.memberships m
                 where m.id = p_membership_id and m.org_id = public.current_org_id()) then
    raise exception 'AscendOS: Mitgliedschaft nicht in dieser Organisation.';
  end if;
  select coalesce(sum(delta), 0) into v_sum
  from public.ap_ledger where membership_id = p_membership_id;
  update public.memberships set ap_total = v_sum where id = p_membership_id;
  return v_sum;
end;
$$;


-- ============================================================
-- 12. Zeilenrechte
--
-- Muster wie im Bestand: Kataloge sind fuer Mitglieder der
-- Organisation lesbar und nur fuer Super-Admins schreibbar. Das
-- Punkteregister ist fuer Nutzer NUR lesbar -- geschrieben wird
-- ausschliesslich vom Trigger, der SECURITY DEFINER ist.
--
-- Bewusste Entscheidung zur OEFFENTLICHKEIT, nach der bestaetigten
-- Regel "Raenge und Profilrahmen sind oeffentlich sichtbar, Rollen
-- nicht": `membership_cosmetics` und `monthly_awards` sind fuer die
-- ganze Organisation lesbar. `ap_ledger` ist es NICHT -- der
-- Punktestand einer anderen Person ist nicht jedermanns Sache, nur
-- der daraus abgeleitete Rang.
-- ============================================================

alter table public.seasons              enable row level security;
alter table public.ap_rules             enable row level security;
alter table public.ap_ledger            enable row level security;
alter table public.ranks                enable row level security;
alter table public.cosmetic_items       enable row level security;
alter table public.membership_cosmetics enable row level security;
alter table public.payouts              enable row level security;
alter table public.monthly_awards       enable row level security;

-- ---------- Kataloge: lesen alle Mitglieder, schreiben nur Super-Admin
create policy seasons_select_org on public.seasons for select
  using (org_id = public.current_org_id());
create policy seasons_admin_write on public.seasons for all
  using (public.is_super_admin() and org_id = public.current_org_id())
  with check (public.is_super_admin() and org_id = public.current_org_id());

create policy ap_rules_select_org on public.ap_rules for select
  using (org_id = public.current_org_id());
create policy ap_rules_admin_write on public.ap_rules for all
  using (public.is_super_admin() and org_id = public.current_org_id())
  with check (public.is_super_admin() and org_id = public.current_org_id());

create policy ranks_select_org on public.ranks for select
  using (org_id = public.current_org_id());
create policy ranks_admin_write on public.ranks for all
  using (public.is_super_admin() and org_id = public.current_org_id())
  with check (public.is_super_admin() and org_id = public.current_org_id());

create policy cosmetic_items_select_org on public.cosmetic_items for select
  using (org_id = public.current_org_id());
create policy cosmetic_items_admin_write on public.cosmetic_items for all
  using (public.is_super_admin() and org_id = public.current_org_id())
  with check (public.is_super_admin() and org_id = public.current_org_id());

-- ---------- Punkteregister: NUR lesen, und nur den eigenen Stand
-- Kein INSERT, UPDATE oder DELETE fuer Nutzer. Geschrieben wird
-- ausschliesslich von ap_award_from_event() (SECURITY DEFINER).
create policy ap_ledger_select_own on public.ap_ledger for select
  using (
    membership_id = public.active_membership_id()
    or (
      public.is_super_admin()
      and exists (select 1 from public.memberships m
                  where m.id = ap_ledger.membership_id
                    and m.org_id = public.current_org_id())
    )
  );

-- ---------- Kosmetik: oeffentlich in der Organisation, weil Rahmen
-- oeffentlich sind. Aendern darf man nur die eigene Ausruestung.
create policy membership_cosmetics_select_org on public.membership_cosmetics for select
  using (
    exists (select 1 from public.memberships m
            where m.id = membership_cosmetics.membership_id
              and m.org_id = public.current_org_id())
  );

create policy membership_cosmetics_equip_own on public.membership_cosmetics for update
  using (membership_id = public.active_membership_id())
  with check (membership_id = public.active_membership_id());

create policy membership_cosmetics_admin_write on public.membership_cosmetics for all
  using (
    public.is_super_admin()
    and exists (select 1 from public.memberships m
                where m.id = membership_cosmetics.membership_id
                  and m.org_id = public.current_org_id())
  )
  with check (
    public.is_super_admin()
    and exists (select 1 from public.memberships m
                where m.id = membership_cosmetics.membership_id
                  and m.org_id = public.current_org_id())
  );

-- ---------- Ansprueche: eigene sehen. Kein Schreiben durch Nutzer.
-- Der Super-Admin sieht die Ansprueche seiner Organisation, damit er
-- sie bestaetigen kann -- ueber awarded_for_membership_id, weil
-- payouts absichtlich kein org_id hat (der Anspruch gehoert zur
-- Identitaet, nicht zur Organisation).
create policy payouts_select_own on public.payouts for select
  using (
    identity_id = auth.uid()
    or (
      public.is_super_admin()
      and exists (select 1 from public.memberships m
                  where m.id = payouts.awarded_for_membership_id
                    and m.org_id = public.current_org_id())
    )
  );

-- Nur die Bestaetigung der Zahlung, und nur durch Super-Admin.
create policy payouts_admin_confirm on public.payouts for update
  using (
    public.is_super_admin()
    and exists (select 1 from public.memberships m
                where m.id = payouts.awarded_for_membership_id
                  and m.org_id = public.current_org_id())
  )
  with check (
    public.is_super_admin()
    and exists (select 1 from public.memberships m
                where m.id = payouts.awarded_for_membership_id
                  and m.org_id = public.current_org_id())
  );

-- ---------- Auszeichnung: oeffentlich in der Organisation
create policy monthly_awards_select_org on public.monthly_awards for select
  using (org_id = public.current_org_id());
create policy monthly_awards_admin_write on public.monthly_awards for all
  using (public.is_super_admin() and org_id = public.current_org_id())
  with check (public.is_super_admin() and org_id = public.current_org_id());


-- ============================================================
-- 13. Ausfuehrungs- und Tabellenrechte
--
-- Muster aus der Security Baseline: PUBLIC zuerst entziehen, dann
-- selektiv gewaehren. Ein Entzug von anon allein ist wirkungslos,
-- solange PUBLIC das Recht haelt.
--
-- Keine dieser neuen Funktionen wird INNERHALB einer RLS-Policy
-- aufgerufen -- deshalb brauchen sie, anders als current_org_id() und
-- is_super_admin(), kein EXECUTE fuer anon.
-- ============================================================

revoke execute on function public.rank_for_ap(uuid, integer)      from PUBLIC, anon;
revoke execute on function public.next_rank_for_ap(uuid, integer) from PUBLIC, anon;
revoke execute on function public.ap_recalculate(uuid)            from PUBLIC, anon;

grant execute on function public.rank_for_ap(uuid, integer)      to authenticated, service_role;
grant execute on function public.next_rank_for_ap(uuid, integer) to authenticated, service_role;
grant execute on function public.ap_recalculate(uuid)            to authenticated, service_role;

grant select on public.seasons, public.ap_rules, public.ranks,
               public.cosmetic_items, public.ap_ledger,
               public.membership_cosmetics, public.payouts,
               public.monthly_awards to authenticated;

grant update on public.membership_cosmetics to authenticated;  -- nur is_equipped, per Policy
grant update on public.payouts to authenticated;               -- nur Bestaetigung, per Policy

grant all on public.seasons, public.ap_rules, public.ranks,
             public.cosmetic_items, public.ap_ledger,
             public.membership_cosmetics, public.payouts,
             public.monthly_awards to service_role;


-- ============================================================
-- 14. Startdaten
--
-- Fuer JEDE bestehende Organisation, nicht nur die eine vorhandene --
-- damit eine spaeter angelegte Organisation nicht ohne Rangkatalog
-- dasteht.
--
-- PUNKTWERTE ABSICHTLICH ALLE 0. Der Betreiber hat am 31. Juli 2026
-- ausdruecklich festgelegt, die Werte spaeter selbst zu bestimmen. Die
-- Zeilen existieren, damit die vollstaendige Liste sichtbar ist und
-- nur die Zahl geaendert werden muss -- ohne Migration, ohne
-- Auslieferung. Bei ap = 0 bucht der Trigger nichts.
-- ============================================================

-- ---------- Raenge: sieben erspielbare Stufen ----------
-- frame_asset haelt einen SCHLUESSEL, keinen Pfad. Die Oberflaeche
-- waehlt daraus die passende Groesse (96 px in Listen, 320 px im
-- Profil), ohne dass die Datenbank Bildgroessen kennt.
insert into public.ranks (org_id, key, label, threshold_ap, frame_asset, payout_cents, payout_kind, sort_order)
select o.id, v.key, v.label, v.threshold, v.frame, v.cents, v.pkind, v.ord
from public.organizations o
cross join (values
  ('newcomer',    'Newcomer',     0,     'frame-01', null::integer, null::text, 1),
  ('active',      'Active',       250,   'frame-02', null,          null,       2),
  ('consistent',  'Consistent',   1250,  'frame-03', null,          null,       3),
  ('elite',       'Elite',        5000,  'frame-04', null,          null,       4),
  ('legend',      'Legend',       15000, 'frame-05', null,          null,       5),
  -- Die einmalige Belohnung haengt HIER, nicht im Code.
  ('team_leader', 'Team Leader',  30000, 'frame-06', 10000, 'team_leader_bonus', 6),
  ('mentor',      'Mentor',       50000, 'frame-07', null,          null,       7)
) as v(key, label, threshold, frame, cents, pkind, ord)
on conflict (org_id, key) do nothing;

-- ---------- Rangrahmen als kosmetische Gegenstaende ----------
-- Ueber rank_key mit dem Rang verbunden: beim Erreichen der Schwelle
-- schaltet ap_apply_to_total() sie automatisch frei. Sie erscheinen
-- damit in der Sammlung, auch nachdem ein hoeherer Rang erreicht ist.
insert into public.cosmetic_items (org_id, kind, key, label, asset_path, rank_key, sort_order)
select r.org_id, 'frame', 'rank-' || r.key, r.label || ' Rahmen', r.frame_asset, r.key, r.sort_order
from public.ranks r
on conflict (org_id, kind, key) do nothing;

-- ---------- Hero-Rahmen: keine Rangbelohnung ----------
-- Gehoert ausschliesslich zur monatlichen Auszeichnung, hat deshalb
-- KEIN rank_key und wird nicht ueber Punkte freigeschaltet.
insert into public.cosmetic_items (org_id, kind, key, label, asset_path, rank_key, sort_order)
select o.id, 'frame', 'hero-berater-des-monats', 'Berater des Monats', 'frame-10', null, 100
from public.organizations o
on conflict (org_id, kind, key) do nothing;

-- ---------- Punkteregeln: vollstaendige Liste, alle Werte 0 ----------
insert into public.ap_rules (org_id, source_kind, event_type, ap, note)
select o.id, 'pipeline_event', v.et, 0, 'Wert vom Betreiber festzulegen'
from public.organizations o
cross join (values
  ('contact_created'),('first_touch'),('follow_up'),('presentation_sent'),
  ('presentation_viewed'),('fit_check_sent'),('fit_check_completed'),
  ('waytomoon_sent'),('three_way_call_done'),('party_scheduled'),
  ('party_done'),('became_customer'),('registered')
) as v(et)
on conflict do nothing;

-- 'correction' bekommt KEINE eigene Regel: eine Korrektur bucht den
-- Wert der KORRIGIERTEN Ereignisart gegen, nicht einen eigenen.

insert into public.ap_rules (org_id, source_kind, event_type, ap, note)
select o.id, 'usage_event', v.et, 0, 'Wert vom Betreiber festzulegen'
from public.organizations o
cross join (values
  ('app_opened'),('coach_message_sent'),('contact_created'),
  ('journey_step_completed'),('mission_skipped'),('plan_committed')
) as v(et)
on conflict do nothing;


-- ============================================================
-- 15. Was Sprint 4 hier NICHT entschieden hat
--
--   a) Titel an der Identitaet: `membership_cosmetics` haengt an der
--      Mitgliedschaft, konsequent zur Regel fuer AP. Ein Titel wie
--      "Founder" koennte zur Person gehoeren. Falls gewuenscht, ist
--      das eine ERGAENZENDE Tabelle `identity_cosmetics`, kein Umbau.
--   b) Rahmen 08 (DEVELOPER) und 09 (SUPER ADMIN) sind NICHT
--      eingetragen. Rollen sind nach bestaetigter Regel nicht
--      oeffentlich sichtbar; ein oeffentlicher Rollenrahmen widerspraeche
--      dem. Ob sie im EIGENEN Profil erscheinen duerfen, ist offen.
--   c) Streaks: `ap_rules` mit source_kind 'usage_event' und
--      event_type 'app_opened' traegt sie bereits. Die Frage, ob ein
--      verpasster Tag auf null zurueckwirft oder langsam verliert, ist
--      offen und beruehrt dieses Schema nicht.
--   d) Mindestteilnehmerzahl fuer die monatliche Auszeichnung.
-- ============================================================

-- ############ 20260806000019_avatar_storage.sql ############
-- ============================================================
-- Migration 19, Sprint 4 Phase 2: Speicher-Bucket fuer Profilbilder
--
-- SETZT MIGRATIONEN 15 BIS 18 VORAUS (memberships, Profilspiegel).
--
-- ZIEL
--   profiles.avatar_url bekommt einen echten Upload-Pfad. Bisher
--   existierte die Spalte ohne Bucket (Sprint-4-Plan Abschnitt 1.3).
--
-- REGELN
--   1. Pfadkonvention: {auth.uid()}/avatar.<ext>
--      Der erste Pfadabschnitt IST die Identitaet. Policies pruefen
--      das serverseitig — das UI darf den Pfad nicht "frei" waehlen.
--   2. Oeffentlich LESBAR: Avatar-URLs stehen in profiles /
--      profiles_public und werden als <img src> geladen. Ein privater
--      Bucket wuerde fuer jedes Bild eine signierte URL verlangen und
--      die Mitgliederliste unbrauchbar machen.
--   3. Schreiben nur fuer den eigenen Ordner. Kein org-weiter Upload.
--   4. MIME und Groesse am Bucket begrenzt (Defense in Depth).
--   5. Keine Geschaeftsregel aendert sich. Nur Infrastruktur fuer
--      eine bereits vorhandene Spalte (Golden Rule / PROJECT_BIBLE).
-- ============================================================

-- ---------- Bucket -------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatare',
  'avatare',
  true,
  2097152, -- 2 MiB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------- Policies auf storage.objects ---------------------------
-- Idempotent: alte Policies gleichen Namens entfernen, falls ein
-- Teil-Lauf haengen blieb.

drop policy if exists avatare_select_public     on storage.objects;
drop policy if exists avatare_insert_own        on storage.objects;
drop policy if exists avatare_update_own        on storage.objects;
drop policy if exists avatare_delete_own        on storage.objects;

-- Lesen: oeffentlich (Bucket public=true + SELECT fuer authenticated/
-- anon, damit Studio und Client-Listen konsistent sind).
create policy avatare_select_public
  on storage.objects
  for select
  to public
  using (bucket_id = 'avatare');

-- Anlegen: nur im eigenen Ordner {uid}/...
create policy avatare_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatare'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Ersetzen: nur eigener Ordner
create policy avatare_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatare'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatare'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Loeschen: nur eigener Ordner
create policy avatare_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatare'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ############ 20260807000020_auth_membership_authority.sql ############
-- ============================================================
-- Migration 20: memberships.role is the only authority
--
-- profiles.role/org_id/team_id remain a read-only mirror (sync from
-- memberships). active_membership_id() keeps the explicit
-- x-ascendos-org selector and the single-membership auto-resolve;
-- when multiple memberships exist without a header, the profile
-- mirror org_id is used as a non-authoritative fallback so existing
-- single-org sessions keep working.
--
-- RLS policies are NOT changed.
-- ============================================================

-- 1) Ensure every profile has an active membership (idempotent).
insert into public.memberships
  (identity_id, org_id, team_id, role, status, country, goals, joined_at, created_at)
select p.id, p.org_id, p.team_id, p.role, 'active', p.country, p.goals, p.created_at, p.created_at
from public.profiles p
where p.org_id is not null
  and p.team_id is not null
  and not exists (
    select 1 from public.memberships m
    where m.identity_id = p.id
      and m.org_id = p.org_id
      and m.status = 'active'
  );

-- 2) Mirror: membership wins. Repair drifted profiles.role / org / team.
-- Prefer the membership that already matches profiles.org_id; else oldest.
do $$
begin
  perform set_config('ascendos.mirror_sync', 'on', true);

  update public.profiles p
  set role    = s.role,
      org_id  = s.org_id,
      team_id = s.team_id
  from (
    select distinct on (m.identity_id)
      m.identity_id,
      m.role,
      m.org_id,
      m.team_id
    from public.memberships m
    join public.profiles pr on pr.id = m.identity_id
    where m.status = 'active'
    order by
      m.identity_id,
      (m.org_id = pr.org_id) desc,
      m.joined_at asc nulls last,
      m.created_at asc
  ) s
  where p.id = s.identity_id
    and (
      p.role is distinct from s.role
      or p.org_id is distinct from s.org_id
      or p.team_id is distinct from s.team_id
    );
end $$;

-- 3) active_membership_id — same contract + mirror-org fallback
create or replace function public.active_membership_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_selektor uuid;
  v_treffer  uuid;
  v_anzahl   int;
  v_mirror   uuid;
begin
  if v_uid is null then
    return null;
  end if;

  begin
    v_selektor := nullif(
      (current_setting('request.headers', true)::json ->> 'x-ascendos-org'), ''
    )::uuid;
  exception when others then
    v_selektor := null;
  end;

  if v_selektor is not null then
    select m.id into v_treffer
    from public.memberships m
    where m.identity_id = v_uid
      and m.org_id      = v_selektor
      and m.status      = 'active';
    return v_treffer;
  end if;

  select count(*) into v_anzahl
  from public.memberships m
  where m.identity_id = v_uid and m.status = 'active';

  if v_anzahl = 1 then
    select m.id into v_treffer
    from public.memberships m
    where m.identity_id = v_uid and m.status = 'active';
    return v_treffer;
  end if;

  if v_anzahl < 1 then
    return null;
  end if;

  -- Multiple memberships, no header: prefer mirrored profiles.org_id.
  select p.org_id into v_mirror from public.profiles p where p.id = v_uid;

  if v_mirror is not null then
    select m.id into v_treffer
    from public.memberships m
    where m.identity_id = v_uid
      and m.org_id = v_mirror
      and m.status = 'active';
    if v_treffer is not null then
      return v_treffer;
    end if;
  end if;

  return null;
end;
$$;

comment on function public.active_membership_id() is
  'Validated active membership. Selector x-ascendos-org preferred; single active membership auto-resolves; multi without header falls back to profiles.org_id mirror.';

-- Helpers stay membership-backed (reassert for clarity; no policy changes).
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.memberships m
  where m.id = public.active_membership_id();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select m.role = 'super_admin' from public.memberships m
     where m.id = public.active_membership_id()),
    false
  );
$$;

grant execute on function public.active_membership_id() to anon, authenticated, service_role;
grant execute on function public.current_user_role()    to anon, authenticated, service_role;
grant execute on function public.is_super_admin()       to anon, authenticated, service_role;

-- Allow reading organization names for every org the identity belongs to
-- (needed for the active-org switcher). Existing select policy kept.
drop policy if exists organizations_select_own_memberships on public.organizations;
create policy organizations_select_own_memberships
  on public.organizations for select
  using (
    exists (
      select 1 from public.memberships m
      where m.identity_id = auth.uid()
        and m.org_id = organizations.id
        and m.status = 'active'
    )
  );

-- ############ 20260808000021_fix_create_invite_pgcrypto.sql ############
-- ============================================================
-- Migration 21: Fix create_invite random bytes (pgcrypto)
--
-- Migration 7 already qualified extensions.gen_random_bytes.
-- Migration 16 rewrote create_invite for memberships and
-- accidentally used bare gen_random_bytes() again. With
-- search_path = public that fails: function does not exist.
--
-- Applied migrations are never edited (ADR-018) — fix here.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.create_invite(invite_role text default 'berater')
returns table (invite_code text, invite_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership public.memberships;
  v_code text;
begin
  select * into v_membership
  from public.memberships
  where id = public.active_membership_id();

  if v_membership.id is null then
    raise exception 'AscendOS: Keine aktive Mitgliedschaft für diesen Nutzer.';
  end if;

  if invite_role <> 'berater' and v_membership.role <> 'super_admin' then
    raise exception 'AscendOS: Nur Super-Admins können Admin- oder Leader-Einladungen erstellen.';
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
  values (v_code, v_membership.org_id, v_membership.team_id,
          v_membership.identity_id, invite_role, v_membership.identity_id);

  return query
    select i.code, i.expires_at from public.invites i where i.code = v_code;
end;
$$;

revoke execute on function public.create_invite(text) from PUBLIC, anon;
grant  execute on function public.create_invite(text) to authenticated, service_role;

comment on function public.create_invite(text) is
  'Creates an invite from the active membership. Uses extensions.gen_random_bytes (pgcrypto).';

-- ############ 20260809000022_developer_role_special_frames.sql ############
-- ============================================================
-- Migration 22: Rolle `developer` + Sonderrahmen (kein AP-Rang)
--
-- frame-08 = Developer, frame-09 = Super Admin — Anzeige über Rolle.
-- ranks / threshold_ap / seed-Ränge bleiben unverändert.
-- ============================================================

-- memberships.role: developer zulassen (Constraint-Name ist Postgres-Default).
alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships
  add constraint memberships_role_check
  check (role in ('super_admin', 'admin', 'berater', 'leader', 'developer'));

-- profiles.role ist nur Spiegel — muss denselben Wertebereich erlauben.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'berater', 'leader', 'developer'));

-- Kosmetik-Katalog: Sonderrahmen ohne rank_key (nicht über AP freischaltbar).
insert into public.cosmetic_items (org_id, kind, key, label, asset_path, rank_key, sort_order)
select o.id, 'frame', 'special-developer', 'Developer', 'frame-08', null, 98
from public.organizations o
on conflict (org_id, kind, key) do nothing;

insert into public.cosmetic_items (org_id, kind, key, label, asset_path, rank_key, sort_order)
select o.id, 'frame', 'special-super-admin', 'Super Admin', 'frame-09', null, 99
from public.organizations o
on conflict (org_id, kind, key) do nothing;

-- ############ 20260810000023_aaa_ap_game_economy.sql ############
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

-- ############ 20260811000024_ascent_mentor_personality.sql ############
-- ============================================================
-- Ascent Mentor-Persönlichkeit: Spezialisten-Prompts angleichen
-- CORE_RULES leben in der Edge Function; agents.system_prompt
-- ergänzt nur die Fach-Spezialisierung — in derselben Stimme.
-- ============================================================

update public.agents
set system_prompt =
  'Du bist Ascents Recruiting-Spezialist — immer noch derselbe Mentor, nur mit Fokus auf Interessenten: qualifizieren, Einwände klären, Präsentation → Fit Check → 3-Way-Call → Registrierung. Du nimmst Angst ernst, baust keinen Druck auf und führst konsequent zur nächsten konkreten Aktion.'
where key = 'recruiting';

update public.agents
set system_prompt =
  'Du bist Ascents Sales-Spezialist — derselbe Mentor, Fokus Produkte und Kunden: Nutzen statt Druck, Duftpartys planen und nachbereiten, aus Käufern Stammkunden machen. Immer: eine klare Einsicht, warum sie wirkt, und der nächste Schritt heute.'
where key = 'sales';

update public.agents
set system_prompt =
  'Du bist Ascents Knowledge-Spezialist — derselbe Mentor, Fokus Präzision: Produkte, Vergütung, Abläufe, Schulung. Antworte auf Basis der Teamdokumente; fehlen sie, sagst du das klar. Auch Fakten enden mit einem umsetzbaren nächsten Schritt.'
where key = 'knowledge';

-- ############ 20260812000025_restore_org_ambiguity_reject.sql ############
-- ============================================================
-- Migration 25: Restore F2 Fall 4 — never guess the active org
--
-- Migration 20 added a profiles.org_id mirror fallback when an
-- identity has multiple active memberships and no x-ascendos-org
-- header. That contradicts F2 Teil 1.3 Fall 4 (ABWEISEN, nicht
-- raten) and the pgTAP suite that encodes it.
--
-- Single-membership auto-resolve (Fall 3) and the explicit
-- selector (Fall 1/2) stay unchanged. The frontend always sets
-- x-ascendos-org after AuthProvider resolves the active org.
-- ============================================================

create or replace function public.active_membership_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_selektor uuid;
  v_treffer  uuid;
  v_anzahl   int;
begin
  if v_uid is null then
    return null;
  end if;

  begin
    v_selektor := nullif(
      (current_setting('request.headers', true)::json ->> 'x-ascendos-org'), ''
    )::uuid;
  exception when others then
    v_selektor := null;
  end;

  if v_selektor is not null then
    select m.id into v_treffer
    from public.memberships m
    where m.identity_id = v_uid
      and m.org_id      = v_selektor
      and m.status      = 'active';
    return v_treffer;
  end if;

  select count(*) into v_anzahl
  from public.memberships m
  where m.identity_id = v_uid and m.status = 'active';

  if v_anzahl = 1 then
    select m.id into v_treffer
    from public.memberships m
    where m.identity_id = v_uid and m.status = 'active';
    return v_treffer;
  end if;

  -- Fall 4: multiple active memberships, no selector → reject.
  return null;
end;
$$;

comment on function public.active_membership_id() is
  'Validated active membership. Selector x-ascendos-org preferred; single active membership auto-resolves; multi without header returns null (F2 Fall 4).';

-- System pipeline events (source = system) may have no acting user.
-- log_contact_created always sets owner_id; other system writers may omit it.
-- AP award treats a null created_by as "no membership to credit".
alter table public.pipeline_events
  alter column created_by drop not null;

-- AAA mission scorer was introduced without a pinned search_path (F1).
create or replace function public.ap_design_score_mission(p_mission_type text)
returns int
language sql
immutable
set search_path = public
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

-- ============================================================
-- Gamification table privileges (Sprint 4 intent)
--
-- Migration 13 sets default ALL on future tables for anon and
-- authenticated. Migration 18 then granted SELECT (+ limited UPDATE)
-- but never revoked the inherited ALL. Result:
--   - UPDATE ap_rules as berater updates 0 rows (RLS) with no error
--     instead of 42501 (M8)
--   - authenticated still has INSERT on ap_ledger (O5)
--   - anon still has SELECT on payouts (O6)
--
-- RLS remains the row boundary; table privileges match the
-- documented write surface: service_role writes catalogs/ledger;
-- authenticated reads; limited UPDATE only where policies allow.
-- ============================================================

revoke all on table
  public.seasons,
  public.ap_rules,
  public.ranks,
  public.cosmetic_items,
  public.ap_ledger,
  public.membership_cosmetics,
  public.payouts,
  public.monthly_awards
from anon, authenticated;

grant select on
  public.seasons,
  public.ap_rules,
  public.ranks,
  public.cosmetic_items,
  public.ap_ledger,
  public.membership_cosmetics,
  public.payouts,
  public.monthly_awards
to authenticated;

grant update on public.membership_cosmetics to authenticated;
grant update on public.payouts to authenticated;

grant all on
  public.seasons,
  public.ap_rules,
  public.ranks,
  public.cosmetic_items,
  public.ap_ledger,
  public.membership_cosmetics,
  public.payouts,
  public.monthly_awards
to service_role;

-- ############ 20260813000026_genealogy_engine.sql ############
-- ============================================================
-- Migration 26: Genealogy Engine — tree payload + last seen
--
-- Sprint 4.1. get_downline returns (user_id, depth). Leaders need
-- one enriched, authorization-safe payload for the canvas.
-- Sidelines stay invisible: CTE is rooted in an authorized membership.
-- ============================================================

alter table public.memberships
  add column if not exists last_app_opened_at timestamptz;

comment on column public.memberships.last_app_opened_at is
  'Last app_opened usage_event for this membership (presence proxy).';

update public.memberships m
set last_app_opened_at = sub.mx
from (
  select ue.user_id, ue.org_id, max(ue.created_at) as mx
  from public.usage_events ue
  where ue.event_type = 'app_opened'
  group by ue.user_id, ue.org_id
) sub
where m.identity_id = sub.user_id
  and m.org_id = sub.org_id
  and m.last_app_opened_at is null;

create or replace function public.sync_membership_last_app_opened()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_type is distinct from 'app_opened' then
    return new;
  end if;

  update public.memberships
  set last_app_opened_at = greatest(
    coalesce(last_app_opened_at, new.created_at),
    new.created_at
  )
  where identity_id = new.user_id
    and org_id = new.org_id
    and status = 'active';

  return new;
end;
$$;

drop trigger if exists usage_events_sync_last_app_opened on public.usage_events;
create trigger usage_events_sync_last_app_opened
  after insert on public.usage_events
  for each row execute function public.sync_membership_last_app_opened();

create or replace function public.get_genealogy_tree(p_root_identity uuid default null)
returns table (
  membership_id uuid,
  identity_id uuid,
  sponsor_membership_id uuid,
  depth int,
  first_name text,
  last_name text,
  username text,
  avatar_url text,
  phone text,
  role text,
  ap_total int,
  rank_key text,
  rank_label text,
  frame_asset text,
  direct_count int,
  team_count int,
  last_app_opened_at timestamptz,
  is_berater_des_monats boolean,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_org uuid := public.current_org_id();
  v_root_identity uuid;
  v_root_membership uuid;
  v_period date := date_trunc('month', now())::date;
begin
  if v_caller is null or v_org is null then
    return;
  end if;

  v_root_identity := coalesce(p_root_identity, v_caller);

  select m.id into v_root_membership
  from public.memberships m
  where m.identity_id = v_root_identity
    and m.org_id = v_org
    and m.status = 'active';

  if v_root_membership is null then
    return;
  end if;

  if not (
    v_root_identity = v_caller
    or public.is_ancestor_of(v_root_identity)
    or public.is_super_admin()
  ) then
    return;
  end if;

  return query
  with recursive tree as (
    select
      m.id as mid,
      m.identity_id as iid,
      m.sponsor_membership_id as sponsor_mid,
      0 as lvl,
      array[m.id] as path
    from public.memberships m
    where m.id = v_root_membership

    union all

    select
      c.id,
      c.identity_id,
      c.sponsor_membership_id,
      t.lvl + 1,
      t.path || c.id
    from public.memberships c
    join tree t on c.sponsor_membership_id = t.mid
    where c.org_id = v_org
      and c.status = 'active'
      and not (c.id = any (t.path))
  )
  select
    t.mid,
    t.iid,
    t.sponsor_mid,
    t.lvl,
    coalesce(p.first_name, '')::text,
    coalesce(p.last_name, '')::text,
    coalesce(p.username, '')::text,
    p.avatar_url,
    p.phone,
    m.role::text,
    coalesce(m.ap_total, 0)::int,
    r.key::text,
    r.label::text,
    r.frame_asset::text,
    (
      select count(*)::int from tree d where d.sponsor_mid = t.mid
    ),
    (
      select count(*)::int
      from tree d
      where t.mid = any (d.path) and d.mid <> t.mid
    ),
    m.last_app_opened_at,
    exists (
      select 1
      from public.monthly_awards ma
      where ma.membership_id = t.mid
        and ma.period = v_period
    ),
    m.joined_at
  from tree t
  join public.memberships m on m.id = t.mid
  left join public.profiles p on p.id = t.iid
  left join lateral (
    select rk.key, rk.label, rk.frame_asset
    from public.rank_for_ap(v_org, coalesce(m.ap_total, 0)) rk
  ) r on true
  order by t.lvl, p.first_name, p.last_name;
end;
$$;

comment on function public.get_genealogy_tree(uuid) is
  'Enriched genealogy tree for the active org. Root defaults to caller. Auth matches get_downline.';

revoke all on function public.get_genealogy_tree(uuid) from public, anon;
grant execute on function public.get_genealogy_tree(uuid) to authenticated, service_role;

-- ############ 20260814000027_leader_experience.sql ############
-- ============================================================
-- Migration 27: Leader Experience (Sprint 4.2)
--
-- Favorites, notes, AP task catalog + completions (anti-cheat),
-- TeamLeader qualification (5 active firstlines → rank/frame/€100),
-- leader dashboard / leaderboard / insights / warnings RPCs,
-- enriched genealogy fields (ICP month, streak, favorite, sponsor).
-- ============================================================

-- ---------- Columns on memberships ----------
alter table public.memberships
  add column if not exists streak_days integer not null default 0,
  add column if not exists streak_updated_on date,
  add column if not exists team_leader_qualified_at timestamptz;

comment on column public.memberships.streak_days is
  'Consecutive calendar days with app_opened.';
comment on column public.memberships.team_leader_qualified_at is
  'Set when 5 active firstline business partners are present.';

-- ---------- Favorites & notes ----------
create table if not exists public.leadership_favorites (
  owner_membership_id uuid not null references public.memberships(id) on delete cascade,
  target_membership_id uuid not null references public.memberships(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_membership_id, target_membership_id),
  check (owner_membership_id <> target_membership_id)
);

create table if not exists public.leadership_notes (
  id uuid primary key default gen_random_uuid(),
  owner_membership_id uuid not null references public.memberships(id) on delete cascade,
  target_membership_id uuid not null references public.memberships(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  updated_at timestamptz not null default now(),
  unique (owner_membership_id, target_membership_id)
);

alter table public.leadership_favorites enable row level security;
alter table public.leadership_notes enable row level security;

create policy leadership_favorites_own on public.leadership_favorites
  for all using (
    owner_membership_id = public.active_membership_id()
  ) with check (
    owner_membership_id = public.active_membership_id()
  );

create policy leadership_notes_own on public.leadership_notes
  for all using (
    owner_membership_id = public.active_membership_id()
  ) with check (
    owner_membership_id = public.active_membership_id()
  );

grant select, insert, update, delete on public.leadership_favorites to authenticated;
grant select, insert, update, delete on public.leadership_notes to authenticated;
grant all on public.leadership_favorites, public.leadership_notes to service_role;

-- ---------- AP Task catalog (manual completions → ledger) ----------
create table if not exists public.ap_task_defs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  title text not null,
  description text,
  category text not null default 'activity'
    check (category in ('outreach','follow_up','meeting','sale','recruit','rank','other')),
  difficulty text not null default 'normal'
    check (difficulty in ('easy','normal','hard','epic')),
  ap integer not null check (ap > 0),
  repeatable boolean not null default true,
  cooldown_hours integer check (cooldown_hours is null or cooldown_hours >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

create table if not exists public.ap_task_completions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  task_id uuid not null references public.ap_task_defs(id) on delete restrict,
  status text not null default 'done'
    check (status in ('open','in_progress','done')),
  ap_awarded integer not null default 0,
  ledger_id uuid references public.ap_ledger(id) on delete set null,
  note text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  -- Anti-cheat: one DONE completion per non-repeatable task
  unique (membership_id, task_id, completed_at)
);

-- Anti-cheat: each ledger credit can only bind once; one-time tasks enforced in complete_ap_task().
create unique index if not exists ap_task_completions_ledger_once
  on public.ap_task_completions (ledger_id)
  where ledger_id is not null;

alter table public.ap_task_defs enable row level security;
alter table public.ap_task_completions enable row level security;

create policy ap_task_defs_select_org on public.ap_task_defs for select
  using (org_id = public.current_org_id());
create policy ap_task_defs_admin_write on public.ap_task_defs for all
  using (public.is_super_admin() and org_id = public.current_org_id())
  with check (public.is_super_admin() and org_id = public.current_org_id());

create policy ap_task_completions_select on public.ap_task_completions for select
  using (
    membership_id = public.active_membership_id()
    or exists (
      select 1 from public.memberships m
      where m.id = ap_task_completions.membership_id
        and m.org_id = public.current_org_id()
        and (
          public.is_super_admin()
          or public.is_ancestor_of(m.identity_id)
        )
    )
  );

create policy ap_task_completions_insert_own on public.ap_task_completions for insert
  with check (membership_id = public.active_membership_id());

grant select on public.ap_task_defs to authenticated;
grant select, insert on public.ap_task_completions to authenticated;
grant all on public.ap_task_defs, public.ap_task_completions to service_role;

-- Seed default tasks for every org
insert into public.ap_task_defs (org_id, key, title, description, category, difficulty, ap, repeatable, cooldown_hours, sort_order)
select o.id, v.key, v.title, v.description, v.category, v.difficulty, v.ap, v.repeatable, v.cooldown, v.sort
from public.organizations o
cross join (values
  ('prospect_messaged', 'Interessent angeschrieben', 'Kurze persönliche Nachricht gesendet.', 'outreach', 'easy', 5, true, 4, 10),
  ('follow_up_done', 'Follow-up durchgeführt', 'Dokumentiertes Nachfassen.', 'follow_up', 'normal', 10, true, 4, 20),
  ('zoom_invited', 'Zoom eingeladen', 'Termin/Einladung verschickt.', 'meeting', 'normal', 15, true, 8, 30),
  ('product_consult', 'Produktberatung abgeschlossen', 'Beratung mit Interessent beendet.', 'meeting', 'hard', 20, true, 12, 40),
  ('new_customer', 'Neuer Kunde', 'Kunde gewonnen und dokumentiert.', 'sale', 'hard', 30, true, 24, 50),
  ('new_partner', 'Neuer Businesspartner', 'Partner registriert unter dir.', 'recruit', 'hard', 50, true, 24, 60),
  ('first_sale_of_partner', 'Erster Verkauf des neuen Partners', 'Dein Partner hat den ersten Verkauf.', 'sale', 'epic', 100, true, 24, 70),
  ('rank_reached', 'Neuer Rang erreicht', 'Rangaufstieg bestätigt.', 'rank', 'epic', 250, false, null, 80)
) as v(key, title, description, category, difficulty, ap, repeatable, cooldown, sort)
on conflict (org_id, key) do nothing;

-- Complete task → AP once (SECURITY DEFINER)
create or replace function public.complete_ap_task(p_task_key text, p_note text default null)
returns table (completion_id uuid, ap_awarded int, new_ap_total int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mid uuid := public.active_membership_id();
  v_org uuid := public.current_org_id();
  v_task public.ap_task_defs;
  v_recent timestamptz;
  v_completion_id uuid;
  v_ledger_id uuid;
  v_total int;
begin
  if auth.uid() is null or v_mid is null or v_org is null then
    raise exception 'AscendOS: Nicht angemeldet.';
  end if;

  select * into v_task
  from public.ap_task_defs t
  where t.org_id = v_org and t.key = p_task_key and t.is_active;

  if v_task.id is null then
    raise exception 'AscendOS: Aufgabe unbekannt.';
  end if;

  if not v_task.repeatable then
    if exists (
      select 1 from public.ap_task_completions c
      where c.membership_id = v_mid and c.task_id = v_task.id and c.status = 'done'
    ) then
      raise exception 'AscendOS: Aufgabe bereits abgeschlossen.';
    end if;
  elsif v_task.cooldown_hours is not null then
    select max(c.completed_at) into v_recent
    from public.ap_task_completions c
    where c.membership_id = v_mid and c.task_id = v_task.id and c.status = 'done';
    if v_recent is not null and v_recent > now() - make_interval(hours => v_task.cooldown_hours) then
      raise exception 'AscendOS: Aufgabe noch in Abkühlzeit.';
    end if;
  end if;

  insert into public.ap_ledger (membership_id, delta, reason, source_kind, source_event_id)
  values (v_mid, v_task.ap, 'Aufgabe: ' || v_task.title, 'manual', gen_random_uuid())
  returning id into v_ledger_id;

  insert into public.ap_task_completions
    (membership_id, task_id, status, ap_awarded, ledger_id, note, started_at, completed_at)
  values
    (v_mid, v_task.id, 'done', v_task.ap, v_ledger_id, p_note, now(), now())
  returning id into v_completion_id;

  select ap_total into v_total from public.memberships where id = v_mid;

  return query select v_completion_id, v_task.ap, coalesce(v_total, 0);
end;
$$;

revoke all on function public.complete_ap_task(text, text) from public, anon;
grant execute on function public.complete_ap_task(text, text) to authenticated, service_role;

-- ---------- Streak update on app_opened ----------
create or replace function public.sync_membership_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (new.created_at at time zone 'utc')::date;
begin
  if new.event_type is distinct from 'app_opened' then
    return new;
  end if;

  update public.memberships m
  set
    streak_days = case
      when m.streak_updated_on = v_today then m.streak_days
      when m.streak_updated_on = v_today - 1 then m.streak_days + 1
      else 1
    end,
    streak_updated_on = v_today,
    last_app_opened_at = greatest(coalesce(m.last_app_opened_at, new.created_at), new.created_at)
  where m.identity_id = new.user_id
    and m.org_id = new.org_id
    and m.status = 'active';

  return new;
end;
$$;

-- Replace previous last_app_opened-only trigger with streak-aware one
drop trigger if exists usage_events_sync_last_app_opened on public.usage_events;
drop trigger if exists usage_events_sync_streak on public.usage_events;
create trigger usage_events_sync_streak
  after insert on public.usage_events
  for each row execute function public.sync_membership_streak();

-- Keep old function harmless if referenced
create or replace function public.sync_membership_last_app_opened()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new; -- superseded by sync_membership_streak
end;
$$;

-- ---------- TeamLeader qualification (5 active firstlines) ----------
-- Active firstline = status active AND (last_app_opened_at within 30 days OR joined within 30 days)
create or replace function public.count_active_firstlines(p_membership uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.memberships d
  where d.sponsor_membership_id = p_membership
    and d.status = 'active'
    and (
      public.current_org_id() is null
      or d.org_id = public.current_org_id()
      or public.is_super_admin()
    )
    and (
      d.last_app_opened_at >= now() - interval '30 days'
      or d.joined_at >= now() - interval '30 days'
    );
$$;

create or replace function public.evaluate_team_leader_qualification(p_membership uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_org uuid;
  v_identity uuid;
  v_already timestamptz;
  v_rank record;
begin
  select org_id, identity_id, team_leader_qualified_at
    into v_org, v_identity, v_already
  from public.memberships where id = p_membership;

  if v_org is null then return false; end if;

  -- JWT path: only same org (or super-admin). Triggers may run without org header.
  if auth.uid() is not null and public.current_org_id() is not null then
    if v_org is distinct from public.current_org_id() and not public.is_super_admin() then
      return false;
    end if;
  end if;

  v_count := public.count_active_firstlines(p_membership);

  if v_count < 5 then
    return false;
  end if;

  if v_already is not null then
    return true;
  end if;

  update public.memberships
  set team_leader_qualified_at = now()
  where id = p_membership and team_leader_qualified_at is null;

  -- Unlock team_leader frame cosmetics if present
  insert into public.membership_cosmetics (membership_id, item_id, kind)
  select p_membership, ci.id, ci.kind
  from public.cosmetic_items ci
  where ci.org_id = v_org and ci.is_active and ci.rank_key = 'team_leader'
  on conflict (membership_id, item_id) do nothing;

  -- €100 bonus once — ONLY via this qualification path
  select * into v_rank
  from public.ranks
  where org_id = v_org and key = 'team_leader' and is_active
  limit 1;

  if v_rank.id is not null and v_rank.payout_cents is not null then
    insert into public.payouts
      (identity_id, kind, amount_cents, awarded_for_membership_id, note)
    values (
      v_identity,
      coalesce(v_rank.payout_kind, 'team_leader_bonus'),
      v_rank.payout_cents,
      p_membership,
      'TeamLeader: 5 aktive Firstlines erreicht'
    )
    on conflict (identity_id, kind) do nothing;
  end if;

  return true;
end;
$$;

create or replace function public.trg_eval_team_leader_on_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sponsor_membership_id is not null then
    perform public.evaluate_team_leader_qualification(new.sponsor_membership_id);
  end if;
  if tg_op = 'UPDATE' and old.sponsor_membership_id is distinct from new.sponsor_membership_id
     and old.sponsor_membership_id is not null then
    perform public.evaluate_team_leader_qualification(old.sponsor_membership_id);
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_eval_team_leader on public.memberships;
create trigger memberships_eval_team_leader
  after insert or update of status, sponsor_membership_id, last_app_opened_at
  on public.memberships
  for each row execute function public.trg_eval_team_leader_on_membership();

-- AP path must NOT auto-create team_leader_bonus (qualification owns it)
create or replace function public.ap_apply_to_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total    integer;
  v_org      uuid;
  v_identity uuid;
  v_rank     record;
begin
  update public.memberships
  set ap_total = ap_total + new.delta
  where id = new.membership_id
  returning ap_total, org_id, identity_id into v_total, v_org, v_identity;

  if v_org is null then return new; end if;

  insert into public.membership_cosmetics (membership_id, item_id, kind)
  select new.membership_id, ci.id, ci.kind
  from public.cosmetic_items ci
  join public.ranks r on r.org_id = ci.org_id and r.key = ci.rank_key
  where ci.org_id = v_org and ci.is_active
    and ci.rank_key is not null and r.is_active
    and r.threshold_ap <= v_total
    and ci.rank_key is distinct from 'team_leader'
  on conflict (membership_id, item_id) do nothing;

  for v_rank in
    select * from public.ranks
    where org_id = v_org and is_active
      and payout_cents is not null and threshold_ap <= v_total
      and key is distinct from 'team_leader'
  loop
    insert into public.payouts
      (identity_id, kind, amount_cents, awarded_for_membership_id, note)
    values (v_identity, v_rank.payout_kind, v_rank.payout_cents, new.membership_id,
            'Automatisch erkannt beim Erreichen von ' || v_rank.label)
    on conflict (identity_id, kind) do nothing;
  end loop;

  return new;
end;
$$;

-- ---------- Progress RPC ----------
create or replace function public.get_team_leader_progress(p_membership uuid default null)
returns table (
  membership_id uuid,
  active_firstlines int,
  required_firstlines int,
  qualified boolean,
  qualified_at timestamptz,
  bonus_entitled boolean,
  bonus_paid boolean,
  bonus_amount_cents int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mid uuid := coalesce(p_membership, public.active_membership_id());
  v_identity uuid;
  v_org uuid;
begin
  if auth.uid() is null or v_mid is null then return; end if;

  select m.identity_id, m.org_id into v_identity, v_org
  from public.memberships m where m.id = v_mid;
  if v_org is null then return; end if;

  if not (
    v_identity = auth.uid()
    or public.is_ancestor_of(v_identity)
    or public.is_super_admin()
  ) then
    return;
  end if;

  -- Refresh evaluation opportunistically
  perform public.evaluate_team_leader_qualification(v_mid);

  return query
  select
    v_mid,
    public.count_active_firstlines(v_mid),
    5,
    (m.team_leader_qualified_at is not null),
    m.team_leader_qualified_at,
    (m.team_leader_qualified_at is not null),
    exists (
      select 1 from public.payouts p
      where p.identity_id = m.identity_id
        and p.kind = 'team_leader_bonus'
        and p.confirmed_paid_at is not null
    ),
    coalesce((
      select r.payout_cents from public.ranks r
      where r.org_id = m.org_id and r.key = 'team_leader' limit 1
    ), 10000)
  from public.memberships m where m.id = v_mid;
end;
$$;

revoke all on function public.get_team_leader_progress(uuid) from public, anon;
grant execute on function public.get_team_leader_progress(uuid) to authenticated, service_role;

-- ---------- Leader dashboard ----------
create or replace function public.get_leader_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mid uuid := public.active_membership_id();
  v_org uuid := public.current_org_id();
  v_today date := current_date;
  v_month_start date := date_trunc('month', now())::date;
  v_result jsonb;
begin
  if v_mid is null or v_org is null then
    return '{}'::jsonb;
  end if;

  with tree as (
    select * from public.get_genealogy_tree(null)
  ),
  team_ids as (
    select membership_id from tree where depth > 0
  )
  select jsonb_build_object(
    'active_today', (
      select count(*) from tree t
      where t.depth > 0 and t.last_app_opened_at::date = v_today
    ),
    'new_registrations_month', (
      select count(*) from tree t
      where t.depth > 0 and t.joined_at::date >= v_month_start
    ),
    'team_ap', (
      select coalesce(sum(t.ap_total), 0) from tree t where t.depth > 0
    ),
    'team_size', (select count(*) from tree t where t.depth > 0),
    'direct_count', (select count(*) from tree t where t.depth = 1),
    'inactive_14d', (
      select count(*) from tree t
      where t.depth > 0 and (
        t.last_app_opened_at is null
        or t.last_app_opened_at < now() - interval '14 days'
      )
    ),
    'tasks_done_today', (
      select count(*) from public.ap_task_completions c
      join team_ids ti on ti.membership_id = c.membership_id
      where c.status = 'done' and c.completed_at::date = v_today
    ),
    'icp_month', (
      select coalesce(sum(l.delta), 0)
      from public.ap_ledger l
      where l.membership_id = v_mid
        and l.delta > 0
        and l.created_at >= v_month_start
    ),
    'month_goal_ap', 2500,
    'goal_progress', least(100, round(
      100.0 * coalesce((select ap_total from public.memberships where id = v_mid),0)
      / nullif(2500,0)
    )::numeric, 1),
    'my_ap_total', (select ap_total from public.memberships where id = v_mid),
    'new_customers_month', (
      select count(*) from public.pipeline_events e
      where e.org_id = v_org
        and e.created_by = (select identity_id from public.memberships where id = v_mid)
        and e.event_type = 'fit_check_completed'
        and e.created_at >= v_month_start
    ),
    'open_followups', (
      select count(*) from public.contacts c
      where c.org_id = v_org
        and c.owner_id = (select identity_id from public.memberships where id = v_mid)
        and c.next_step_due is not null
        and c.next_step_due::date <= current_date
    ),
    'tasks_done_by_team_today', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'membership_id', x.membership_id,
        'name', x.name,
        'ap', x.ap,
        'tasks', x.tasks
      ) order by x.ap desc), '[]'::jsonb)
      from (
        select c.membership_id,
               trim(both from coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) as name,
               sum(c.ap_awarded)::int as ap,
               count(*)::int as tasks
        from public.ap_task_completions c
        join team_ids ti on ti.membership_id = c.membership_id
        join public.memberships m on m.id = c.membership_id
        left join public.profiles p on p.id = m.identity_id
        where c.status = 'done' and c.completed_at::date = v_today
        group by c.membership_id, p.first_name, p.last_name
        limit 20
      ) x
    )
  ) into v_result;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_leader_dashboard() from public, anon;
grant execute on function public.get_leader_dashboard() to authenticated, service_role;

-- ---------- Leaderboard ----------
create or replace function public.get_team_leaderboard(
  p_period text default 'month',
  p_sort text default 'ap'
)
returns table (
  membership_id uuid,
  identity_id uuid,
  first_name text,
  last_name text,
  avatar_url text,
  rank_label text,
  frame_asset text,
  metric numeric,
  ap_total int,
  direct_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz;
begin
  if public.active_membership_id() is null then return; end if;

  v_since := case p_period
    when 'today' then date_trunc('day', now())
    when 'week' then date_trunc('week', now())
    when 'year' then date_trunc('year', now())
    else date_trunc('month', now())
  end;

  return query
  with tree as (
    select * from public.get_genealogy_tree(null)
  ),
  scored as (
    select
      t.*,
      coalesce((
        select sum(l.delta)::numeric
        from public.ap_ledger l
        where l.membership_id = t.membership_id
          and l.delta > 0
          and l.created_at >= v_since
      ), 0) as period_ap,
      coalesce((
        select count(*)::numeric
        from public.memberships d
        where d.sponsor_membership_id = t.membership_id
          and d.status = 'active'
          and d.joined_at >= v_since
      ), 0) as new_partners,
      coalesce((
        select count(*)::numeric
        from public.ap_task_completions c
        where c.membership_id = t.membership_id
          and c.status = 'done'
          and c.completed_at >= v_since
      ), 0) as activity_score
    from tree t
    where t.depth >= 0
  )
  select
    s.membership_id,
    s.identity_id,
    s.first_name,
    s.last_name,
    s.avatar_url,
    s.rank_label,
    s.frame_asset,
    case p_sort
      when 'icp' then s.period_ap
      when 'new_partners' then s.new_partners
      when 'activity' then s.activity_score
      else s.period_ap
    end as metric,
    s.ap_total,
    s.direct_count
  from scored s
  order by metric desc, s.ap_total desc
  limit 50;
end;
$$;

revoke all on function public.get_team_leaderboard(text, text) from public, anon;
grant execute on function public.get_team_leaderboard(text, text) to authenticated, service_role;

-- ---------- Insights ----------
create or replace function public.get_team_insights()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_row record;
begin
  if public.active_membership_id() is null then
    return v_items;
  end if;

  -- Most active (recent open)
  select * into v_row from public.get_genealogy_tree(null) t
  where t.depth > 0
  order by t.last_app_opened_at desc nulls last
  limit 1;
  if found then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind','most_active','emoji','🔥','title','Aktivster Partner',
      'membership_id', v_row.membership_id,
      'name', trim(both from v_row.first_name||' '||v_row.last_name),
      'detail','Zuletzt aktiv'
    ));
  end if;

  -- Fastest growth (most directs)
  select * into v_row from public.get_genealogy_tree(null) t
  where t.depth > 0
  order by t.direct_count desc, t.joined_at desc
  limit 1;
  if found and v_row.direct_count > 0 then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind','fastest_growth','emoji','🚀','title','Schnellstes Wachstum',
      'membership_id', v_row.membership_id,
      'name', trim(both from v_row.first_name||' '||v_row.last_name),
      'detail', v_row.direct_count || ' Direkte'
    ));
  end if;

  -- Rising (highest AP among depth>0)
  select * into v_row from public.get_genealogy_tree(null) t
  where t.depth > 0
  order by t.ap_total desc
  limit 1;
  if found then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind','rising_star','emoji','⭐','title','Aufsteiger',
      'membership_id', v_row.membership_id,
      'name', trim(both from v_row.first_name||' '||v_row.last_name),
      'detail', v_row.ap_total || ' AP'
    ));
  end if;

  -- Inactive long
  select * into v_row from public.get_genealogy_tree(null) t
  where t.depth > 0
    and (t.last_app_opened_at is null or t.last_app_opened_at < now() - interval '14 days')
  order by t.last_app_opened_at asc nulls first
  limit 1;
  if found then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind','inactive','emoji','💤','title','Lange inaktiv',
      'membership_id', v_row.membership_id,
      'name', trim(both from v_row.first_name||' '||v_row.last_name),
      'detail','Melde dich persönlich'
    ));
  end if;

  -- Near next rank
  select t.*, (
    select min(r.threshold_ap) - t.ap_total
    from public.ranks r
    where r.org_id = public.current_org_id() and r.is_active and r.threshold_ap > t.ap_total
  ) as gap
  into v_row
  from public.get_genealogy_tree(null) t
  where t.depth > 0
  order by (
    select min(r.threshold_ap) - t.ap_total
    from public.ranks r
    where r.org_id = public.current_org_id() and r.is_active and r.threshold_ap > t.ap_total
  ) asc nulls last
  limit 1;
  if found and v_row.gap is not null and v_row.gap > 0 and v_row.gap <= 500 then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind','near_rank','emoji','🎯','title','Kurz vor nächstem Rang',
      'membership_id', v_row.membership_id,
      'name', trim(both from v_row.first_name||' '||v_row.last_name),
      'detail', 'Noch '||v_row.gap||' AP'
    ));
  end if;

  return v_items;
end;
$$;

revoke all on function public.get_team_insights() from public, anon;
grant execute on function public.get_team_insights() to authenticated, service_role;

-- ---------- Smart warnings ----------
create or replace function public.get_smart_warnings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_items jsonb := '[]'::jsonb;
  r record;
begin
  if public.active_membership_id() is null then return v_items; end if;

  for r in
    select * from public.get_genealogy_tree(null) t where t.depth > 0
  loop
    if r.last_app_opened_at is null or r.last_app_opened_at < now() - interval '7 days' then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'kind','no_activity_7d',
        'membership_id', r.membership_id,
        'name', trim(both from r.first_name||' '||r.last_name),
        'title','7 Tage keine Aktivität',
        'action','Schreib eine kurze WhatsApp: „Wie kann ich dich diese Woche unterstützen?“'
      ));
    end if;
    if r.last_app_opened_at is null or r.last_app_opened_at < now() - interval '30 days' then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'kind','no_order_proxy_30d',
        'membership_id', r.membership_id,
        'name', trim(both from r.first_name||' '||r.last_name),
        'title','30 Tage ohne App-Aktivität',
        'action','Vereinbare ein 10-Minuten-Check-in und setze ein gemeinsames Tagesziel.'
      ));
    end if;
  end loop;

  -- Cap noise for leaders
  if jsonb_array_length(v_items) > 40 then
    select jsonb_agg(e) into v_items
    from (
      select e from jsonb_array_elements(v_items) with ordinality as t(e, ord)
      order by ord
      limit 40
    ) s;
  end if;

  return coalesce(v_items, '[]'::jsonb);
end;
$$;

revoke all on function public.get_smart_warnings() from public, anon;
grant execute on function public.get_smart_warnings() to authenticated, service_role;

-- ---------- Toggle favorite ----------
create or replace function public.toggle_leadership_favorite(p_target_membership uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.active_membership_id();
  v_exists boolean;
begin
  if auth.uid() is null or v_owner is null then
    raise exception 'AscendOS: Nicht angemeldet.';
  end if;
  if p_target_membership = v_owner then
    raise exception 'AscendOS: Dich selbst kannst du nicht anpinnen.';
  end if;
  -- Must be in downline or self-org ancestor path
  if not exists (
    select 1 from public.get_genealogy_tree(null) t where t.membership_id = p_target_membership
  ) then
    raise exception 'AscendOS: Nur Partner in deiner Struktur.';
  end if;

  select exists (
    select 1 from public.leadership_favorites f
    where f.owner_membership_id = v_owner and f.target_membership_id = p_target_membership
  ) into v_exists;

  if v_exists then
    delete from public.leadership_favorites
    where owner_membership_id = v_owner and target_membership_id = p_target_membership;
    return false;
  else
    insert into public.leadership_favorites (owner_membership_id, target_membership_id)
    values (v_owner, p_target_membership);
    return true;
  end if;
end;
$$;

revoke all on function public.toggle_leadership_favorite(uuid) from public, anon;
grant execute on function public.toggle_leadership_favorite(uuid) to authenticated, service_role;

-- ---------- Upsert note ----------
create or replace function public.upsert_leadership_note(p_target_membership uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := public.active_membership_id();
  v_id uuid;
begin
  if auth.uid() is null or v_owner is null then
    raise exception 'AscendOS: Nicht angemeldet.';
  end if;
  if not exists (
    select 1 from public.get_genealogy_tree(null) t where t.membership_id = p_target_membership
  ) then
    raise exception 'AscendOS: Nur Partner in deiner Struktur.';
  end if;

  insert into public.leadership_notes (owner_membership_id, target_membership_id, body, updated_at)
  values (v_owner, p_target_membership, left(trim(p_body), 2000), now())
  on conflict (owner_membership_id, target_membership_id)
  do update set body = excluded.body, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.upsert_leadership_note(uuid, text) from public, anon;
grant execute on function public.upsert_leadership_note(uuid, text) to authenticated, service_role;


-- ---------- Enrich genealogy tree (Sprint 4.2 fields) ----------
drop function if exists public.get_genealogy_tree(uuid);

create function public.get_genealogy_tree(p_root_identity uuid default null)
returns table (
  membership_id uuid,
  identity_id uuid,
  sponsor_membership_id uuid,
  depth int,
  first_name text,
  last_name text,
  username text,
  avatar_url text,
  phone text,
  role text,
  ap_total int,
  rank_key text,
  rank_label text,
  frame_asset text,
  direct_count int,
  team_count int,
  last_app_opened_at timestamptz,
  is_berater_des_monats boolean,
  joined_at timestamptz,
  icp_month int,
  streak_days int,
  is_favorite boolean,
  sponsor_name text,
  message_badge int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_org uuid := public.current_org_id();
  v_root_identity uuid;
  v_root_membership uuid;
  v_viewer uuid := public.active_membership_id();
  v_period date := date_trunc('month', now())::date;
  v_month_start timestamptz := date_trunc('month', now());
begin
  if v_caller is null or v_org is null then
    return;
  end if;

  v_root_identity := coalesce(p_root_identity, v_caller);

  select m.id into v_root_membership
  from public.memberships m
  where m.identity_id = v_root_identity
    and m.org_id = v_org
    and m.status = 'active';

  if v_root_membership is null then
    return;
  end if;

  if not (
    v_root_identity = v_caller
    or public.is_ancestor_of(v_root_identity)
    or public.is_super_admin()
  ) then
    return;
  end if;

  return query
  with recursive tree as (
    select
      m.id as mid,
      m.identity_id as iid,
      m.sponsor_membership_id as sponsor_mid,
      0 as lvl,
      array[m.id] as path
    from public.memberships m
    where m.id = v_root_membership

    union all

    select
      c.id,
      c.identity_id,
      c.sponsor_membership_id,
      t.lvl + 1,
      t.path || c.id
    from public.memberships c
    join tree t on c.sponsor_membership_id = t.mid
    where c.org_id = v_org
      and c.status = 'active'
      and not (c.id = any (t.path))
  )
  select
    t.mid,
    t.iid,
    t.sponsor_mid,
    t.lvl,
    coalesce(p.first_name, '')::text,
    coalesce(p.last_name, '')::text,
    coalesce(p.username, '')::text,
    p.avatar_url,
    p.phone,
    m.role::text,
    coalesce(m.ap_total, 0)::int,
    coalesce(disp.key, r.key)::text,
    coalesce(disp.label, r.label)::text,
    coalesce(disp.frame_asset, r.frame_asset)::text,
    (
      select count(*)::int from tree d where d.sponsor_mid = t.mid
    ),
    (
      select count(*)::int
      from tree d
      where t.mid = any (d.path) and d.mid <> t.mid
    ),
    m.last_app_opened_at,
    exists (
      select 1
      from public.monthly_awards ma
      where ma.membership_id = t.mid
        and ma.period = v_period
    ),
    m.joined_at,
    coalesce((
      select sum(l.delta)::int
      from public.ap_ledger l
      where l.membership_id = t.mid
        and l.delta > 0
        and l.created_at >= v_month_start
    ), 0),
    coalesce(m.streak_days, 0)::int,
    exists (
      select 1 from public.leadership_favorites f
      where f.owner_membership_id = v_viewer
        and f.target_membership_id = t.mid
    ),
    nullif(trim(both from coalesce(sp.first_name,'') || ' ' || coalesce(sp.last_name,'')), ''),
    0::int
  from tree t
  join public.memberships m on m.id = t.mid
  left join public.profiles p on p.id = t.iid
  left join public.memberships sm on sm.id = t.sponsor_mid
  left join public.profiles sp on sp.id = sm.identity_id
  left join lateral (
    select rk.key, rk.label, rk.frame_asset
    from public.rank_for_ap(v_org, coalesce(m.ap_total, 0)) rk
    where rk.key is distinct from 'team_leader'
       or m.team_leader_qualified_at is not null
  ) r on true
  left join lateral (
    select rk.key, rk.label, rk.frame_asset
    from public.ranks rk
    where rk.org_id = v_org and rk.is_active and rk.key = 'team_leader'
      and m.team_leader_qualified_at is not null
      and coalesce(m.ap_total, 0) < coalesce((
        select min(x.threshold_ap) from public.ranks x
        where x.org_id = v_org and x.is_active and x.threshold_ap > rk.threshold_ap
      ), 2147483647)
  ) disp on true
  order by
    exists (
      select 1 from public.leadership_favorites f
      where f.owner_membership_id = v_viewer and f.target_membership_id = t.mid
    ) desc,
    t.lvl,
    p.first_name,
    p.last_name;
end;
$$;

comment on function public.get_genealogy_tree(uuid) is
  'Enriched genealogy tree (4.2: ICP, streak, favorite, sponsor). Auth matches get_downline.';

revoke all on function public.get_genealogy_tree(uuid) from public, anon;
grant execute on function public.get_genealogy_tree(uuid) to authenticated, service_role;

-- ---------- Qualification progress (current / next rank) ----------
create or replace function public.get_qualification_progress(p_membership uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mid uuid := coalesce(p_membership, public.active_membership_id());
  v_org uuid;
  v_identity uuid;
  v_ap int;
  v_tl timestamptz;
  v_current record;
  v_next record;
  v_tl_progress record;
begin
  if auth.uid() is null or v_mid is null then
    return '{}'::jsonb;
  end if;

  select org_id, identity_id, ap_total, team_leader_qualified_at
    into v_org, v_identity, v_ap, v_tl
  from public.memberships where id = v_mid;

  if v_org is null then return '{}'::jsonb; end if;
  if not (
    v_identity = auth.uid() or public.is_ancestor_of(v_identity) or public.is_super_admin()
  ) then
    return '{}'::jsonb;
  end if;

  select * into v_current from public.rank_for_ap(v_org, coalesce(v_ap,0));
  if v_current.key = 'team_leader' and v_tl is null then
    select r.key, r.label, r.threshold_ap, r.frame_asset, r.sort_order
      into v_current
    from public.ranks r
    where r.org_id = v_org and r.is_active and r.key is distinct from 'team_leader'
      and r.threshold_ap <= coalesce(v_ap,0)
    order by r.threshold_ap desc
    limit 1;
  end if;
  if v_tl is not null and (v_current.key is null or v_current.threshold_ap < (
    select threshold_ap from public.ranks where org_id = v_org and key = 'team_leader' limit 1
  )) then
    select r.key, r.label, r.threshold_ap, r.frame_asset, r.sort_order
      into v_current
    from public.ranks r where r.org_id = v_org and r.key = 'team_leader' limit 1;
  end if;

  select * into v_next from public.next_rank_for_ap(v_org, coalesce(v_ap,0));
  if v_next.key = 'team_leader' and v_tl is null then
    -- Next "rank" for TL is firstline qualification, still show AP next after TL if any
    null;
  end if;

  select * into v_tl_progress from public.get_team_leader_progress(v_mid);

  return jsonb_build_object(
    'membership_id', v_mid,
    'ap_total', coalesce(v_ap,0),
    'current_rank', case when v_current.key is null then null else jsonb_build_object(
      'key', v_current.key, 'label', v_current.label,
      'threshold_ap', v_current.threshold_ap, 'frame_asset', v_current.frame_asset
    ) end,
    'next_rank', case when v_next.key is null then null else jsonb_build_object(
      'key', v_next.key, 'label', v_next.label, 'threshold_ap', v_next.threshold_ap,
      'remaining_ap', greatest(0, v_next.threshold_ap - coalesce(v_ap,0))
    ) end,
    'team_leader', jsonb_build_object(
      'qualified', coalesce(v_tl_progress.qualified, false),
      'active_firstlines', coalesce(v_tl_progress.active_firstlines, 0),
      'required_firstlines', coalesce(v_tl_progress.required_firstlines, 5),
      'bonus_amount_cents', coalesce(v_tl_progress.bonus_amount_cents, 10000),
      'bonus_paid', coalesce(v_tl_progress.bonus_paid, false),
      'qualified_at', v_tl_progress.qualified_at
    ),
    'unlocked_rewards', coalesce((
      select jsonb_agg(jsonb_build_object('kind', p.kind, 'amount_cents', p.amount_cents, 'note', p.note))
      from public.payouts p where p.identity_id = v_identity
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_qualification_progress(uuid) from public, anon;
grant execute on function public.get_qualification_progress(uuid) to authenticated, service_role;

-- List active AP tasks for current org
create or replace function public.list_ap_tasks()
returns setof public.ap_task_defs
language sql
stable
security definer
set search_path = public
as $$
  select t.*
  from public.ap_task_defs t
  where t.org_id = public.current_org_id() and t.is_active
  order by t.sort_order, t.ap;
$$;

revoke all on function public.list_ap_tasks() from public, anon;
grant execute on function public.list_ap_tasks() to authenticated, service_role;

-- Seed AP tasks when a new organization is created
create or replace function public.seed_default_ap_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ap_task_defs (org_id, key, title, description, category, difficulty, ap, repeatable, cooldown_hours, sort_order)
  select new.id, v.key, v.title, v.description, v.category, v.difficulty, v.ap, v.repeatable, v.cooldown, v.sort
  from (values
    ('prospect_messaged', 'Interessent angeschrieben', 'Kurze persönliche Nachricht gesendet.', 'outreach', 'easy', 5, true, 4, 10),
    ('follow_up_done', 'Follow-up durchgeführt', 'Dokumentiertes Nachfassen.', 'follow_up', 'normal', 10, true, 4, 20),
    ('zoom_invited', 'Zoom eingeladen', 'Termin/Einladung verschickt.', 'meeting', 'normal', 15, true, 8, 30),
    ('product_consult', 'Produktberatung abgeschlossen', 'Beratung mit Interessent beendet.', 'meeting', 'hard', 20, true, 12, 40),
    ('new_customer', 'Neuer Kunde', 'Kunde gewonnen und dokumentiert.', 'sale', 'hard', 30, true, 24, 50),
    ('new_partner', 'Neuer Businesspartner', 'Partner registriert unter dir.', 'recruit', 'hard', 50, true, 24, 60),
    ('first_sale_of_partner', 'Erster Verkauf des neuen Partners', 'Dein Partner hat den ersten Verkauf.', 'sale', 'epic', 100, true, 24, 70),
    ('rank_reached', 'Neuer Rang erreicht', 'Rangaufstieg bestätigt.', 'rank', 'epic', 250, false, null::int, 80)
  ) as v(key, title, description, category, difficulty, ap, repeatable, cooldown, sort)
  on conflict (org_id, key) do nothing;
  return new;
end;
$$;

drop trigger if exists organizations_seed_ap_tasks on public.organizations;
create trigger organizations_seed_ap_tasks
  after insert on public.organizations
  for each row execute function public.seed_default_ap_tasks();

-- ############ 20260815000028_sprint_5_1_knowledge_live_coaching.sql ############
-- Sprint 5.1 — Coach Knowledge Center + Live Coaching Center (additive only).
-- Does not alter genealogy, AP, rewards, rankings, permissions RPCs, or existing knowledge_docs.

-- ---------------------------------------------------------------------------
-- Helpers (new): SuperAdmin OR Developer may manage coach content
-- ---------------------------------------------------------------------------
create or replace function public.is_coach_content_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- memberships.role is the only authority (same pattern as is_super_admin).
  select coalesce(
    (
      select m.role in ('super_admin', 'developer')
      from public.memberships m
      where m.id = public.active_membership_id()
    ),
    false
  );
$$;

revoke all on function public.is_coach_content_manager() from public;
grant execute on function public.is_coach_content_manager() to authenticated;

-- ---------------------------------------------------------------------------
-- Knowledge Center articles (separate from knowledge_docs RAG ingest)
-- ---------------------------------------------------------------------------
create table if not exists public.coach_knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  body_markdown text not null default '',
  body_html text not null default '',
  category text not null default 'Allgemein',
  tags text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'needs_review', 'approved', 'archived')),
  contradiction_flags jsonb not null default '[]'::jsonb,
  contradiction_summary text,
  active boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  current_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_knowledge_active_requires_approved
    check (not active or status = 'approved')
);

create index if not exists coach_knowledge_articles_status_idx
  on public.coach_knowledge_articles (status, active);
create index if not exists coach_knowledge_articles_category_idx
  on public.coach_knowledge_articles (category);
create index if not exists coach_knowledge_articles_tags_gin
  on public.coach_knowledge_articles using gin (tags);
create index if not exists coach_knowledge_articles_search_idx
  on public.coach_knowledge_articles
  using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body_markdown, '')));

drop trigger if exists coach_knowledge_articles_set_updated_at on public.coach_knowledge_articles;
create trigger coach_knowledge_articles_set_updated_at
before update on public.coach_knowledge_articles
for each row execute function public.set_updated_at();

create table if not exists public.coach_knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.coach_knowledge_articles(id) on delete cascade,
  version int not null,
  title text not null,
  body_markdown text not null,
  body_html text not null default '',
  category text not null,
  tags text[] not null default '{}',
  status text not null,
  change_summary text,
  contradiction_flags jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (article_id, version)
);

create index if not exists coach_knowledge_versions_article_idx
  on public.coach_knowledge_versions (article_id, version desc);

create table if not exists public.coach_knowledge_change_log (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.coach_knowledge_articles(id) on delete cascade,
  version int,
  action text not null,
  detail text,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists coach_knowledge_change_log_article_idx
  on public.coach_knowledge_change_log (article_id, created_at desc);

alter table public.coach_knowledge_articles enable row level security;
alter table public.coach_knowledge_versions enable row level security;
alter table public.coach_knowledge_change_log enable row level security;

drop policy if exists "coach_knowledge_articles_select" on public.coach_knowledge_articles;
create policy "coach_knowledge_articles_select"
on public.coach_knowledge_articles for select to authenticated
using (
  public.is_coach_content_manager()
  or (active = true and status = 'approved')
);

drop policy if exists "coach_knowledge_articles_write" on public.coach_knowledge_articles;
create policy "coach_knowledge_articles_write"
on public.coach_knowledge_articles for all to authenticated
using (public.is_coach_content_manager())
with check (public.is_coach_content_manager());

drop policy if exists "coach_knowledge_versions_select" on public.coach_knowledge_versions;
create policy "coach_knowledge_versions_select"
on public.coach_knowledge_versions for select to authenticated
using (
  public.is_coach_content_manager()
  or exists (
    select 1 from public.coach_knowledge_articles a
    where a.id = article_id and a.active = true and a.status = 'approved'
  )
);

drop policy if exists "coach_knowledge_versions_write" on public.coach_knowledge_versions;
create policy "coach_knowledge_versions_write"
on public.coach_knowledge_versions for all to authenticated
using (public.is_coach_content_manager())
with check (public.is_coach_content_manager());

drop policy if exists "coach_knowledge_change_log_select" on public.coach_knowledge_change_log;
create policy "coach_knowledge_change_log_select"
on public.coach_knowledge_change_log for select to authenticated
using (public.is_coach_content_manager());

drop policy if exists "coach_knowledge_change_log_write" on public.coach_knowledge_change_log;
create policy "coach_knowledge_change_log_write"
on public.coach_knowledge_change_log for all to authenticated
using (public.is_coach_content_manager())
with check (public.is_coach_content_manager());

-- ---------------------------------------------------------------------------
-- Live Coaching events
-- ---------------------------------------------------------------------------
create table if not exists public.live_coaching_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  description text,
  coach_name text not null default 'Coach',
  category text not null default 'Live Coaching',
  language text not null default 'de',
  starts_at timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes > 0 and duration_minutes <= 480),
  zoom_url text,
  repeat_rule text not null default 'none'
    check (repeat_rule in ('none', 'daily', 'weekly', 'biweekly', 'monthly')),
  media_type text not null check (media_type in ('image', 'video')),
  media_path text,
  media_url text,
  active boolean not null default false,
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  -- Future-ready additive columns (unused until later sprints)
  replay_url text,
  recording_url text,
  guest_speakers jsonb not null default '[]'::jsonb,
  library_visible boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_coaching_events_active_starts_idx
  on public.live_coaching_events (active, starts_at);
create index if not exists live_coaching_events_category_idx
  on public.live_coaching_events (category);

drop trigger if exists live_coaching_events_set_updated_at on public.live_coaching_events;
create trigger live_coaching_events_set_updated_at
before update on public.live_coaching_events
for each row execute function public.set_updated_at();

alter table public.live_coaching_events enable row level security;

drop policy if exists "live_coaching_events_select" on public.live_coaching_events;
create policy "live_coaching_events_select"
on public.live_coaching_events for select to authenticated
using (
  public.is_coach_content_manager()
  or active = true
);

drop policy if exists "live_coaching_events_write" on public.live_coaching_events;
create policy "live_coaching_events_write"
on public.live_coaching_events for all to authenticated
using (public.is_coach_content_manager())
with check (public.is_coach_content_manager());

-- ---------------------------------------------------------------------------
-- Push notification subscriptions + outbox (Web Push / local scheduling)
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own"
on public.push_subscriptions for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.coaching_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.live_coaching_events(id) on delete cascade,
  kind text not null check (kind in ('published', 't_minus_30', 't_minus_5')),
  scheduled_for timestamptz not null,
  title text not null,
  body text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, kind)
);

create index if not exists coaching_notification_outbox_due_idx
  on public.coaching_notification_outbox (scheduled_for)
  where sent_at is null;

alter table public.coaching_notification_outbox enable row level security;

drop policy if exists "coaching_notification_outbox_select" on public.coaching_notification_outbox;
create policy "coaching_notification_outbox_select"
on public.coaching_notification_outbox for select to authenticated
using (true);

drop policy if exists "coaching_notification_outbox_write" on public.coaching_notification_outbox;
create policy "coaching_notification_outbox_write"
on public.coaching_notification_outbox for all to authenticated
using (public.is_coach_content_manager())
with check (public.is_coach_content_manager());

-- ---------------------------------------------------------------------------
-- Storage bucket for coaching media (9:16 image / short mp4)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coaching-media',
  'coaching-media',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "coaching_media_public_read" on storage.objects;
create policy "coaching_media_public_read"
on storage.objects for select
using (bucket_id = 'coaching-media');

drop policy if exists "coaching_media_manager_insert" on storage.objects;
create policy "coaching_media_manager_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'coaching-media'
  and public.is_coach_content_manager()
);

drop policy if exists "coaching_media_manager_update" on storage.objects;
create policy "coaching_media_manager_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'coaching-media'
  and public.is_coach_content_manager()
)
with check (
  bucket_id = 'coaching-media'
  and public.is_coach_content_manager()
);

drop policy if exists "coaching_media_manager_delete" on storage.objects;
create policy "coaching_media_manager_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'coaching-media'
  and public.is_coach_content_manager()
);

-- ############ 20260816000029_sprint_5_2_ascend_stories.sql ############
-- Sprint 5.2 — Ascend Stories (additive only).
-- Does not alter genealogy, AP, rewards, rankings, permissions RPCs, or Sprint 5.1 tables.

create table if not exists public.ascend_stories (
  id uuid primary key default gen_random_uuid(),
  story_type text not null
    check (story_type in (
      'achievements',
      'onboarding',
      'presentations',
      'zoom',
      'qualifications',
      'customers',
      'partners',
      'coach_highlights',
      'admin'
    )),
  -- Future-ready media kinds (text is default for Sprint 5.2)
  media_kind text not null default 'text'
    check (media_kind in ('text', 'image', 'video', 'voice')),
  title text not null,
  body text not null,
  author_label text not null default 'Ascend',
  subject_name text,
  subject_membership_id uuid,
  media_path text,
  media_url text,
  tone text not null default 'celebrate'
    check (tone in ('motivate', 'celebrate', 'inspire')),
  source text not null default 'admin'
    check (source in ('coach', 'admin', 'system')),
  active boolean not null default true,
  published_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ascend_stories_expires_after_publish
    check (expires_at > published_at)
);

create index if not exists ascend_stories_active_expires_idx
  on public.ascend_stories (active, expires_at desc);
create index if not exists ascend_stories_type_idx
  on public.ascend_stories (story_type);
create index if not exists ascend_stories_published_idx
  on public.ascend_stories (published_at desc);

drop trigger if exists ascend_stories_set_updated_at on public.ascend_stories;
create trigger ascend_stories_set_updated_at
before update on public.ascend_stories
for each row execute function public.set_updated_at();

alter table public.ascend_stories enable row level security;

-- Everyone authenticated may read active, non-expired stories.
drop policy if exists "ascend_stories_select" on public.ascend_stories;
create policy "ascend_stories_select"
on public.ascend_stories for select to authenticated
using (
  public.is_coach_content_manager()
  or (active = true and expires_at > now())
);

-- SuperAdmin / Developer may publish & manage.
drop policy if exists "ascend_stories_write" on public.ascend_stories;
create policy "ascend_stories_write"
on public.ascend_stories for all to authenticated
using (public.is_coach_content_manager())
with check (public.is_coach_content_manager());

-- ############ 20260817000030_sprint6_frame_display_contract.sql ############
-- Sprint 6 / System 1 — Avatar & Frame display contract
-- 1) Qualification-aware display rank (Team Leader frame only when qualified)
-- 2) Berater-des-Monats flag = place 1 only (align genealogy with profile)
-- 3) Frame cosmetics: list / equip / ensure role specials
-- 4) Auto-equip newly unlocked AP frames when nothing equipped yet

-- ---------- Shared display rank (AP + TL qualification) ----------
create or replace function public.display_rank_for_ap(
  p_org uuid,
  p_ap int,
  p_team_leader_qualified boolean default false
)
returns table (
  key text,
  label text,
  threshold_ap int,
  frame_asset text,
  sort_order int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current record;
  v_tl_threshold int;
begin
  -- Caller binding (F1 / function_security J1): authenticated sessions
  -- may only resolve ranks for their active org (or super_admin).
  if auth.uid() is not null then
    if p_org is distinct from public.current_org_id()
       and not public.is_super_admin() then
      raise exception 'AscendOS: display_rank_for_ap org mismatch';
    end if;
  end if;

  select rk.key, rk.label, rk.threshold_ap, rk.frame_asset, rk.sort_order
    into v_current
  from public.rank_for_ap(p_org, coalesce(p_ap, 0)) rk;

  if v_current.key = 'team_leader' and not coalesce(p_team_leader_qualified, false) then
    select r.key, r.label, r.threshold_ap, r.frame_asset, r.sort_order
      into v_current
    from public.ranks r
    where r.org_id = p_org
      and r.is_active
      and r.key is distinct from 'team_leader'
      and r.threshold_ap <= coalesce(p_ap, 0)
    order by r.threshold_ap desc
    limit 1;
  end if;

  select r.threshold_ap into v_tl_threshold
  from public.ranks r
  where r.org_id = p_org and r.key = 'team_leader' and r.is_active
  limit 1;

  if coalesce(p_team_leader_qualified, false)
     and v_tl_threshold is not null
     and (
       v_current.key is null
       or v_current.threshold_ap < v_tl_threshold
     )
  then
    select r.key, r.label, r.threshold_ap, r.frame_asset, r.sort_order
      into v_current
    from public.ranks r
    where r.org_id = p_org and r.key = 'team_leader' and r.is_active
    limit 1;
  end if;

  if v_current.key is null then
    return;
  end if;

  return query
  select
    v_current.key::text,
    v_current.label::text,
    v_current.threshold_ap::int,
    v_current.frame_asset::text,
    v_current.sort_order::int;
end;
$$;

comment on function public.display_rank_for_ap(uuid, int, boolean) is
  'Display rank/frame: Team Leader only when qualified; otherwise highest earned non-TL rank.';

revoke all on function public.display_rank_for_ap(uuid, int, boolean) from public, anon;
grant execute on function public.display_rank_for_ap(uuid, int, boolean) to authenticated, service_role;

-- ---------- Genealogy: place=1 Berater + display_rank_for_ap ----------
create or replace function public.get_genealogy_tree(p_root_identity uuid default null)
returns table (
  membership_id uuid,
  identity_id uuid,
  sponsor_membership_id uuid,
  depth int,
  first_name text,
  last_name text,
  username text,
  avatar_url text,
  phone text,
  role text,
  ap_total int,
  rank_key text,
  rank_label text,
  frame_asset text,
  direct_count int,
  team_count int,
  last_app_opened_at timestamptz,
  is_berater_des_monats boolean,
  joined_at timestamptz,
  icp_month int,
  streak_days int,
  is_favorite boolean,
  sponsor_name text,
  message_badge int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_org uuid := public.current_org_id();
  v_root_identity uuid;
  v_root_membership uuid;
  v_viewer uuid := public.active_membership_id();
  v_period date := date_trunc('month', now())::date;
  v_month_start timestamptz := date_trunc('month', now());
begin
  if v_caller is null or v_org is null then
    return;
  end if;

  v_root_identity := coalesce(p_root_identity, v_caller);

  select m.id into v_root_membership
  from public.memberships m
  where m.identity_id = v_root_identity
    and m.org_id = v_org
    and m.status = 'active';

  if v_root_membership is null then
    return;
  end if;

  if not (
    v_root_identity = v_caller
    or public.is_ancestor_of(v_root_identity)
    or public.is_super_admin()
  ) then
    return;
  end if;

  return query
  with recursive tree as (
    select
      m.id as mid,
      m.identity_id as iid,
      m.sponsor_membership_id as sponsor_mid,
      0 as lvl,
      array[m.id] as path
    from public.memberships m
    where m.id = v_root_membership

    union all

    select
      c.id,
      c.identity_id,
      c.sponsor_membership_id,
      t.lvl + 1,
      t.path || c.id
    from public.memberships c
    join tree t on c.sponsor_membership_id = t.mid
    where c.org_id = v_org
      and c.status = 'active'
      and not (c.id = any (t.path))
  )
  select
    t.mid,
    t.iid,
    t.sponsor_mid,
    t.lvl,
    coalesce(p.first_name, '')::text,
    coalesce(p.last_name, '')::text,
    coalesce(p.username, '')::text,
    p.avatar_url,
    p.phone,
    m.role::text,
    coalesce(m.ap_total, 0)::int,
    r.key::text,
    r.label::text,
    r.frame_asset::text,
    (
      select count(*)::int from tree d where d.sponsor_mid = t.mid
    ),
    (
      select count(*)::int
      from tree d
      where t.mid = any (d.path) and d.mid <> t.mid
    ),
    m.last_app_opened_at,
    exists (
      select 1
      from public.monthly_awards ma
      where ma.membership_id = t.mid
        and ma.period = v_period
        and ma.place = 1
    ),
    m.joined_at,
    coalesce((
      select sum(l.delta)::int
      from public.ap_ledger l
      where l.membership_id = t.mid
        and l.delta > 0
        and l.created_at >= v_month_start
    ), 0),
    coalesce(m.streak_days, 0)::int,
    exists (
      select 1 from public.leadership_favorites f
      where f.owner_membership_id = v_viewer
        and f.target_membership_id = t.mid
    ),
    nullif(trim(both from coalesce(sp.first_name,'') || ' ' || coalesce(sp.last_name,'')), ''),
    0::int
  from tree t
  join public.memberships m on m.id = t.mid
  left join public.profiles p on p.id = t.iid
  left join public.memberships sm on sm.id = t.sponsor_mid
  left join public.profiles sp on sp.id = sm.identity_id
  left join lateral (
    select d.key, d.label, d.frame_asset
    from public.display_rank_for_ap(
      v_org,
      coalesce(m.ap_total, 0),
      m.team_leader_qualified_at is not null
    ) d
  ) r on true
  order by
    exists (
      select 1 from public.leadership_favorites f
      where f.owner_membership_id = v_viewer and f.target_membership_id = t.mid
    ) desc,
    t.lvl,
    p.first_name,
    p.last_name;
end;
$$;

-- Keep qualification progress on the same contract
create or replace function public.get_qualification_progress(p_membership uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mid uuid := coalesce(p_membership, public.active_membership_id());
  v_org uuid;
  v_identity uuid;
  v_ap int;
  v_tl timestamptz;
  v_current record;
  v_next record;
  v_tl_progress record;
begin
  if auth.uid() is null or v_mid is null then
    return '{}'::jsonb;
  end if;

  select org_id, identity_id, ap_total, team_leader_qualified_at
    into v_org, v_identity, v_ap, v_tl
  from public.memberships where id = v_mid;

  if v_org is null then return '{}'::jsonb; end if;
  if not (
    v_identity = auth.uid() or public.is_ancestor_of(v_identity) or public.is_super_admin()
  ) then
    return '{}'::jsonb;
  end if;

  select * into v_current
  from public.display_rank_for_ap(v_org, coalesce(v_ap,0), v_tl is not null);

  select * into v_next from public.next_rank_for_ap(v_org, coalesce(v_ap,0));
  if v_next.key = 'team_leader' and v_tl is null then
    null;
  end if;

  select * into v_tl_progress from public.get_team_leader_progress(v_mid);

  return jsonb_build_object(
    'membership_id', v_mid,
    'ap_total', coalesce(v_ap,0),
    'current_rank', case when v_current.key is null then null else jsonb_build_object(
      'key', v_current.key, 'label', v_current.label,
      'threshold_ap', v_current.threshold_ap, 'frame_asset', v_current.frame_asset
    ) end,
    'next_rank', case when v_next.key is null then null else jsonb_build_object(
      'key', v_next.key, 'label', v_next.label, 'threshold_ap', v_next.threshold_ap,
      'remaining_ap', greatest(0, v_next.threshold_ap - coalesce(v_ap,0))
    ) end,
    'team_leader', jsonb_build_object(
      'qualified', coalesce(v_tl_progress.qualified, false),
      'active_firstlines', coalesce(v_tl_progress.active_firstlines, 0),
      'required_firstlines', coalesce(v_tl_progress.required_firstlines, 5),
      'bonus_amount_cents', coalesce(v_tl_progress.bonus_amount_cents, 10000),
      'bonus_paid', coalesce(v_tl_progress.bonus_paid, false),
      'qualified_at', v_tl_progress.qualified_at
    ),
    'unlocked_rewards', coalesce((
      select jsonb_agg(jsonb_build_object('kind', p.kind, 'amount_cents', p.amount_cents, 'note', p.note))
      from public.payouts p where p.identity_id = v_identity
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------- Frame cosmetics ----------
create or replace function public.ensure_role_frame_cosmetics()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mid uuid := public.active_membership_id();
  v_org uuid;
  v_role text;
  v_asset text;
begin
  if auth.uid() is null or v_mid is null then
    return;
  end if;

  select m.org_id, m.role::text into v_org, v_role
  from public.memberships m where m.id = v_mid;
  if v_org is null then return; end if;

  if v_role = 'super_admin' then
    v_asset := 'frame-09';
  elsif v_role = 'developer' then
    v_asset := 'frame-08';
  else
    return;
  end if;

  insert into public.membership_cosmetics (membership_id, item_id, kind, is_equipped)
  select v_mid, ci.id, ci.kind, false
  from public.cosmetic_items ci
  where ci.org_id = v_org
    and ci.is_active
    and ci.kind = 'frame'
    and ci.asset_path = v_asset
  on conflict (membership_id, item_id) do nothing;
end;
$$;

revoke all on function public.ensure_role_frame_cosmetics() from public, anon;
grant execute on function public.ensure_role_frame_cosmetics() to authenticated, service_role;

create or replace function public.list_my_frame_cosmetics()
returns table (
  item_id uuid,
  asset_path text,
  label text,
  rank_key text,
  is_equipped boolean,
  unlocked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mid uuid := public.active_membership_id();
begin
  if auth.uid() is null or v_mid is null then
    return;
  end if;

  perform public.ensure_role_frame_cosmetics();

  return query
  select
    ci.id,
    ci.asset_path,
    ci.label,
    ci.rank_key,
    mc.is_equipped,
    mc.unlocked_at
  from public.membership_cosmetics mc
  join public.cosmetic_items ci on ci.id = mc.item_id
  where mc.membership_id = v_mid
    and ci.kind = 'frame'
    and ci.is_active
  order by
    mc.is_equipped desc,
    coalesce((
      select r.threshold_ap from public.ranks r
      where r.org_id = ci.org_id and r.key = ci.rank_key
      limit 1
    ), 0) asc,
    ci.label;
end;
$$;

revoke all on function public.list_my_frame_cosmetics() from public, anon;
grant execute on function public.list_my_frame_cosmetics() to authenticated, service_role;

create or replace function public.equip_frame_cosmetic(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mid uuid := public.active_membership_id();
begin
  if auth.uid() is null or v_mid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.membership_cosmetics mc
    where mc.membership_id = v_mid and mc.item_id = p_item_id and mc.kind = 'frame'
  ) then
    raise exception 'frame not unlocked';
  end if;

  update public.membership_cosmetics
  set is_equipped = false
  where membership_id = v_mid and kind = 'frame' and is_equipped;

  update public.membership_cosmetics
  set is_equipped = true
  where membership_id = v_mid and item_id = p_item_id;
end;
$$;

revoke all on function public.equip_frame_cosmetic(uuid) from public, anon;
grant execute on function public.equip_frame_cosmetic(uuid) to authenticated, service_role;

-- When AP unlocks a frame and nothing is equipped, equip the highest AP frame
create or replace function public.ap_apply_to_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total    integer;
  v_org      uuid;
  v_identity uuid;
  v_rank     record;
  v_had_equipped boolean;
  v_equip_item uuid;
begin
  update public.memberships
  set ap_total = ap_total + new.delta
  where id = new.membership_id
  returning ap_total, org_id, identity_id into v_total, v_org, v_identity;

  if v_org is null then return new; end if;

  select exists (
    select 1 from public.membership_cosmetics mc
    where mc.membership_id = new.membership_id and mc.kind = 'frame' and mc.is_equipped
  ) into v_had_equipped;

  insert into public.membership_cosmetics (membership_id, item_id, kind)
  select new.membership_id, ci.id, ci.kind
  from public.cosmetic_items ci
  join public.ranks r on r.org_id = ci.org_id and r.key = ci.rank_key
  where ci.org_id = v_org and ci.is_active
    and ci.rank_key is not null and r.is_active
    and r.threshold_ap <= v_total
    and ci.rank_key is distinct from 'team_leader'
  on conflict (membership_id, item_id) do nothing;

  if not v_had_equipped then
    select ci.id into v_equip_item
    from public.membership_cosmetics mc
    join public.cosmetic_items ci on ci.id = mc.item_id
    left join public.ranks r on r.org_id = ci.org_id and r.key = ci.rank_key
    where mc.membership_id = new.membership_id
      and ci.kind = 'frame'
      and ci.rank_key is distinct from 'team_leader'
    order by coalesce(r.threshold_ap, 0) desc
    limit 1;

    if v_equip_item is not null then
      update public.membership_cosmetics
      set is_equipped = false
      where membership_id = new.membership_id and kind = 'frame' and is_equipped;

      update public.membership_cosmetics
      set is_equipped = true
      where membership_id = new.membership_id and item_id = v_equip_item;
    end if;
  end if;

  for v_rank in
    select * from public.ranks
    where org_id = v_org and is_active
      and payout_cents is not null and threshold_ap <= v_total
      and key is distinct from 'team_leader'
  loop
    insert into public.payouts
      (identity_id, kind, amount_cents, awarded_for_membership_id, note)
    values (v_identity, v_rank.payout_kind, v_rank.payout_cents, new.membership_id,
            'Automatisch erkannt beim Erreichen von ' || v_rank.label)
    on conflict (identity_id, kind) do nothing;
  end loop;

  return new;
end;
$$;

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
   'Du bist Ascents Recruiting-Spezialist — immer noch derselbe Mentor, nur mit Fokus auf Interessenten: qualifizieren, Einwände klären, Präsentation → Fit Check → 3-Way-Call → Registrierung. Du nimmst Angst ernst, baust keinen Druck auf und führst konsequent zur nächsten konkreten Aktion.',
   '{recruiting,einwaende,prozess}'),
  ('00000000-0000-0000-0000-000000000001', 'sales',
   'Sales Coach',
   'Du bist Ascents Sales-Spezialist — derselbe Mentor, Fokus Produkte und Kunden: Nutzen statt Druck, Duftpartys planen und nachbereiten, aus Käufern Stammkunden machen. Immer: eine klare Einsicht, warum sie wirkt, und der nächste Schritt heute.',
   '{produkte,verkauf,duftparty}'),
  ('00000000-0000-0000-0000-000000000001', 'knowledge',
   'Knowledge Coach',
   'Du bist Ascents Knowledge-Spezialist — derselbe Mentor, Fokus Präzision: Produkte, Vergütung, Abläufe, Schulung. Antworte auf Basis der Teamdokumente; fehlen sie, sagst du das klar. Auch Fakten enden mit einem umsetzbaren nächsten Schritt.',
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
