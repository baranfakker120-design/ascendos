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
