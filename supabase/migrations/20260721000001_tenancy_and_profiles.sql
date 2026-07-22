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
