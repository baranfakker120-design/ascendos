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
