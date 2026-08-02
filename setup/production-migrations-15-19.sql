-- ============================================================
-- AscendOS — PRODUCTION MANUAL PACKAGE: Migrations 15 → 19
-- ============================================================
-- PURPOSE
--   Apply ONLY the pending migrations to an existing Production
--   database that is already at Migration 14 (no public.memberships).
--
-- SOURCE
--   Unmodified copies of:
--     supabase/migrations/20260802000015_identity_and_membership.sql
--     supabase/migrations/20260803000016_registration_and_invites.sql
--     supabase/migrations/20260804000017_mirror_sync_and_public_view.sql
--     supabase/migrations/20260805000018_gamification_foundation.sql
--     supabase/migrations/20260806000019_avatar_storage.sql
--   Do NOT edit the schema here — edit the migration sources and
--   regenerate this package if needed.
--
-- HOW TO RUN
--   1. Supabase Dashboard → project shaydtihwicnocjjlnjm
--   2. SQL Editor → New query
--   3. Paste THIS ENTIRE file → Run
--   4. Run the verification block at the bottom (or keep it in the
--      same run — it only SELECTs / raises notices)
--
-- SAFETY
--   - Not for empty greenfield projects (use setup/setup-complete.sql).
--   - Not for local `supabase db reset` (use migrations folder).
--   - Idempotency is whatever the source migrations already provide
--     (IF NOT EXISTS, CREATE OR REPLACE, etc.). No schema intent changed.
-- ============================================================


-- ################################################################
-- MIGRATION 15: 20260802000015_identity_and_membership.sql
-- ################################################################

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

-- ################################################################
-- MIGRATION 16: 20260803000016_registration_and_invites.sql
-- ################################################################

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

-- ################################################################
-- MIGRATION 17: 20260804000017_mirror_sync_and_public_view.sql
-- ################################################################

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

-- ################################################################
-- MIGRATION 18: 20260805000018_gamification_foundation.sql
-- ################################################################

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

-- ################################################################
-- MIGRATION 19: 20260806000019_avatar_storage.sql
-- ################################################################

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

-- ################################################################
-- VERIFICATION (read-only checks after Migrations 15–19)
-- ################################################################
-- Expect every row to show ok = true. If any is false, stop and fix
-- before pointing the app at this database.

do $$
declare
  v_missing text[] := array[]::text[];
begin
  if to_regclass('public.memberships') is null then
    v_missing := v_missing || 'public.memberships';
  end if;
  if to_regclass('public.ranks') is null then
    v_missing := v_missing || 'public.ranks';
  end if;
  if to_regclass('public.ap_ledger') is null then
    v_missing := v_missing || 'public.ap_ledger';
  end if;
  if to_regclass('public.seasons') is null then
    v_missing := v_missing || 'public.seasons';
  end if;
  if to_regclass('public.cosmetic_items') is null then
    v_missing := v_missing || 'public.cosmetic_items';
  end if;
  if to_regprocedure('public.rank_for_ap(uuid, integer)') is null then
    v_missing := v_missing || 'public.rank_for_ap(uuid, integer)';
  end if;
  if to_regprocedure('public.next_rank_for_ap(uuid, integer)') is null then
    v_missing := v_missing || 'public.next_rank_for_ap(uuid, integer)';
  end if;
  if not exists (select 1 from storage.buckets where id = 'avatare') then
    v_missing := v_missing || 'storage.buckets.avatare';
  end if;

  if array_length(v_missing, 1) is not null then
    raise exception 'AscendOS production package incomplete. Missing: %',
      array_to_string(v_missing, ', ');
  end if;

  raise notice 'AscendOS production package OK: memberships, ranks, ap_ledger, seasons, cosmetic_items, rank_for_ap, next_rank_for_ap, bucket avatare';
end $$;

select
  to_regclass('public.memberships') is not null              as memberships,
  to_regclass('public.ranks') is not null                    as ranks,
  to_regclass('public.ap_ledger') is not null                as ap_ledger,
  to_regclass('public.seasons') is not null                  as seasons,
  to_regclass('public.cosmetic_items') is not null           as cosmetic_items,
  to_regprocedure('public.rank_for_ap(uuid, integer)') is not null as rank_for_ap,
  to_regprocedure('public.next_rank_for_ap(uuid, integer)') is not null as next_rank_for_ap,
  exists (select 1 from storage.buckets where id = 'avatare') as bucket_avatare;
