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
