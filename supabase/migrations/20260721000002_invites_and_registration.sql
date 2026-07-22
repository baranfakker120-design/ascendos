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
