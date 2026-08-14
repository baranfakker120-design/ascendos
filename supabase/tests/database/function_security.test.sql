-- ============================================================
-- F1: Testplan Funktionssicherheit (pgTAP)
-- Ausführen mit: npm run db:test  (supabase test db)
--
-- Prüft die Migration 20260730000012_f1_function_security.sql
-- gegen alle in der Aufgabenstellung genannten Rollen und
-- Manipulationsvarianten:
--   Berater, Leader, Super-Admin, fremde Organisation, anon,
--   authentifiziert, ungültige Kennung, manipulierte Kennung.
--
-- Ein roter Test hier bedeutet: F1 ist NICHT abgeschlossen.
--
-- WICHTIGER HINWEIS zum Trigger auf auth.users:
-- on_auth_user_created ist ein AFTER-INSERT-Trigger und ruft
-- handle_new_user auf. Diese Funktion wirft eine Ausnahme, wenn
-- raw_user_meta_data keinen invite_code enthält. Ein Insert mit
-- nur id und email schlägt deshalb fehl. Die bestehenden Tests
-- (rls, daily_plan, journey, phases) enthalten an dieser Stelle
-- einen falschen Kommentar und legen den Trigger NICHT still.
-- Sie können in dieser Form nicht durchlaufen. Hier wird der
-- Trigger für die Dauer der Testtransaktion abgeschaltet.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(35);

-- ---------- Trigger stilllegen, nur in dieser Transaktion ----------

-- ---------- Organisationen und Teams ----------

insert into public.organizations (id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'TestOrg'),
  ('a0000000-0000-0000-0000-000000000002', 'FremdeOrg');

insert into public.teams (id, org_id, name) values
  ('b0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001', 'TestTeam'),
  ('b0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000002', 'FremdesTeam');

-- ---------- Nutzer ----------
-- Struktur in TestOrg:
--   ANNA (super_admin)
--     +-- BERT (berater)
--     |     +-- CLARA (berater)
--     +-- DORA (berater)   <- Sideline zu BERT
--     +-- LEO  (leader)
-- FremdeOrg:
--   EMIL (berater)

-- ---------- Testumgebung: Trigger fuer den Auth-Insert umgehen ----------
-- on_auth_user_created ist ein AFTER-INSERT-Trigger auf auth.users und
-- ruft handle_new_user auf. Diese Funktion WIRFT eine Ausnahme, wenn
-- raw_user_meta_data keinen invite_code enthaelt. Ohne Umgehung laeuft
-- keine Testdatei durch.
--
-- WICHTIG, warum nicht ALTER TABLE ... DISABLE TRIGGER:
-- Das verlangt Eigentum an auth.users. Eigentuemer ist
-- supabase_auth_admin. Die Verbindungsrolle postgres ist dort NICHT
-- Mitglied und ist kein Superuser (geprueft: rolsuper = false). Auf
-- einer gehosteten Supabase-Datenbank scheitert der Befehl deshalb,
-- lokal wuerde er funktionieren. Das ergibt genau den Fall
-- "laeuft bei mir", der spaeter teuer wird.
--
-- session_replication_role wirkt fuer postgres, ist transaktionslokal
-- und funktioniert in beiden Umgebungen identisch.
-- Es wird unmittelbar nach dem Auth-Insert zurueckgeschaltet, damit
-- Fremdschluesselpruefungen und die Trigger contacts_log_created und
-- set_updated_at fuer alle weiteren Anweisungen wieder greifen.
set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-00000000000a', 'anna@test.local'),
  ('c0000000-0000-0000-0000-00000000000b', 'bert@test.local'),
  ('c0000000-0000-0000-0000-00000000000c', 'clara@test.local'),
  ('c0000000-0000-0000-0000-00000000000d', 'dora@test.local'),
  ('c0000000-0000-0000-0000-00000000000e', 'leo@test.local'),
  ('c0000000-0000-0000-0000-00000000000f', 'emil@test.local');

-- Ab hier wieder vollstaendige Trigger- und Fremdschluesselpruefung.
set local session_replication_role = origin;

insert into public.profiles
  (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('c0000000-0000-0000-0000-00000000000a',
   'a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001',
   null, 'super_admin', 'Anna', 'Admin', 'anna'),
  ('c0000000-0000-0000-0000-00000000000b',
   'a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'berater', 'Bert', 'Berater', 'bert'),
  ('c0000000-0000-0000-0000-00000000000c',
   'a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000b', 'berater', 'Clara', 'Berater', 'clara'),
  ('c0000000-0000-0000-0000-00000000000d',
   'a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'berater', 'Dora', 'Berater', 'dora'),
  ('c0000000-0000-0000-0000-00000000000e',
   'a0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000a', 'leader', 'Leo', 'Leader', 'leo'),
  ('c0000000-0000-0000-0000-00000000000f',
   'a0000000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-000000000002',
   null, 'berater', 'Emil', 'Extern', 'emil');

-- Mitgliedschaften + Genealogie (Migration 15). Unter replica, sonst
-- loescht sync_profile_mirror profiles.sponsor_id vor dem Sponsor-Update.
set local session_replication_role = replica;
insert into public.memberships (identity_id, org_id, team_id, role, status)
select p.id, p.org_id, p.team_id, p.role, 'active'
from public.profiles p
where p.id::text like 'c0000000%'
  and not exists (
    select 1 from public.memberships m
    where m.identity_id = p.id and m.org_id = p.org_id and m.status = 'active'
  );
update public.memberships m
set sponsor_membership_id = sp.id
from public.profiles p
join public.memberships sp
  on sp.identity_id = p.sponsor_id and sp.org_id = p.org_id and sp.status = 'active'
where m.identity_id = p.id and m.org_id = p.org_id and m.status = 'active'
  and p.id::text like 'c0000000%' and p.sponsor_id is not null;
set local session_replication_role = origin;

-- ---------- Kontakte ----------
-- Der Trigger contacts_log_created erzeugt je Kontakt automatisch
-- ein contact_created-Event. Das ist gewollt.

insert into public.contacts (id, org_id, owner_id, name, next_step, next_step_due)
values
  ('d0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000b', 'Mehmet', 'Anrufen', current_date),
  ('d0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-00000000000c', 'Ayse', 'Nachfassen', current_date);


-- ---------- Hilfsfunktion: als Nutzer agieren ----------

create schema if not exists tests;

-- URSACHE A, behoben. Das Schema wird hier als postgres angelegt.
-- tests.authenticate_as schaltet die Rolle danach auf authenticated.
-- Der ERSTE Aufruf laeuft noch als postgres, jeder WEITERE als
-- authenticated, und die hat ohne diese Zeile kein USAGE auf einem
-- Schema, das postgres gerade erzeugt und nie freigegeben hat.
-- Ohne den Grant scheitert jeder zweite Rollenwechsel mit
--   permission denied for schema tests
grant usage on schema tests to authenticated;

create or replace function tests.authenticate_as(user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ============================================================
-- A. plan_contact_state: Fremdzugriff ist strukturell unmöglich
-- ============================================================

select tests.authenticate_as('c0000000-0000-0000-0000-00000000000b'); -- BERT

select is(
  (select count(*)::int from public.plan_contact_state()),
  1,
  'A1 Berater sieht genau seinen eigenen Kontakt'
);

select is(
  (select name from public.plan_contact_state()),
  'Mehmet',
  'A2 Berater sieht den richtigen Kontakt'
);

select tests.authenticate_as('c0000000-0000-0000-0000-00000000000c'); -- CLARA

select is(
  (select name from public.plan_contact_state()),
  'Ayse',
  'A3 Zweiter Berater sieht ausschliesslich seinen eigenen Kontakt, keine Fremddaten'
);

-- ============================================================
-- B. Alte Signaturen mit Fremdparameter sind entfernt
-- ============================================================

select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'plan_contact_state'
     and pg_get_function_arguments(p.oid) like '%uuid%'),
  0,
  'B1 plan_contact_state nimmt keinen Nutzerparameter mehr'
);

select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname like 'plan_signal_%'
     and pg_get_function_arguments(p.oid) like '%uuid%'),
  0,
  'B2 Keine plan_signal-Funktion nimmt mehr einen Nutzerparameter'
);

-- ============================================================
-- C. get_downline: Berechtigung und Mandantengrenze
-- ============================================================

select tests.authenticate_as('c0000000-0000-0000-0000-00000000000b'); -- BERT

select is(
  (select count(*)::int from public.get_downline('c0000000-0000-0000-0000-00000000000b')),
  1,
  'C1 Berater sieht seine eigene Downline (Clara)'
);

select tests.authenticate_as('c0000000-0000-0000-0000-00000000000a'); -- ANNA

select is(
  (select count(*)::int from public.get_downline('c0000000-0000-0000-0000-00000000000a')),
  4,
  'C2 Super-Admin sieht seine eigene vollstaendige Downline (Bert, Clara, Dora, Leo)'
);

select is(
  (select count(*)::int from public.get_downline('c0000000-0000-0000-0000-00000000000b')),
  1,
  'C3 Upline darf die Downline eines Firstline-Partners sehen'
);

select tests.authenticate_as('c0000000-0000-0000-0000-00000000000b'); -- BERT

select is(
  (select count(*)::int from public.get_downline('c0000000-0000-0000-0000-00000000000d')),
  0,
  'C4 Sideline ist unsichtbar: Bert sieht die Struktur von Dora nicht'
);

select is(
  (select count(*)::int from public.get_downline('c0000000-0000-0000-0000-00000000000f')),
  0,
  'C5 Fremde Organisation ist unsichtbar (Mandantengrenze)'
);

select is(
  (select count(*)::int from public.get_downline('99999999-9999-9999-9999-999999999999')),
  0,
  'C6 Manipulierte, nicht existierende Kennung liefert leer statt Fehler'
);

select tests.authenticate_as('c0000000-0000-0000-0000-00000000000a'); -- ANNA

select is(
  (select count(*)::int from public.get_downline('c0000000-0000-0000-0000-00000000000f')),
  0,
  'C7 Auch ein Super-Admin sieht keine fremde Organisation'
);

select tests.authenticate_as('c0000000-0000-0000-0000-00000000000c'); -- CLARA

select is(
  (select count(*)::int from public.get_downline('c0000000-0000-0000-0000-00000000000a')),
  0,
  'C8 Downline darf nicht nach oben schauen'
);

-- ============================================================
-- D. coach_messages_today: Aufruferpruefung
-- ============================================================

select tests.authenticate_as('c0000000-0000-0000-0000-00000000000b'); -- BERT

select is(
  public.coach_messages_today('c0000000-0000-0000-0000-00000000000b'),
  0,
  'D1 Eigene Nutzungszahl ist abrufbar'
);

select throws_like(
  $$ select public.coach_messages_today('c0000000-0000-0000-0000-00000000000c') $$,
  '%Kein Zugriff auf fremde Nutzungsdaten%',
  'D2 Berater kann die Nutzungszahl eines Kollegen nicht abrufen'
);

select tests.authenticate_as('c0000000-0000-0000-0000-00000000000a'); -- ANNA

select is(
  public.coach_messages_today('c0000000-0000-0000-0000-00000000000b'),
  0,
  'D3 Super-Admin darf innerhalb der eigenen Organisation abfragen'
);

select throws_like(
  $$ select public.coach_messages_today('c0000000-0000-0000-0000-00000000000f') $$,
  '%Kein Zugriff auf fremde Nutzungsdaten%',
  'D4 Super-Admin darf keine fremde Organisation abfragen'
);

-- ============================================================
-- E. track_usage: schreibender Pfad
-- ============================================================

select tests.authenticate_as('c0000000-0000-0000-0000-00000000000b'); -- BERT

select lives_ok(
  $$ select public.track_usage('c0000000-0000-0000-0000-00000000000b', 'test_event') $$,
  'E1 Eigenes Nutzungsereignis darf geschrieben werden'
);

-- E2 in zwei Pruefungen aufgeteilt, nachdem sich die Semantik von
-- track_usage geaendert hat: Eine Nachverfolgungsfunktion darf den
-- nachverfolgten Vorgang nicht abbrechen. Statt einer Ausnahme wird
-- daher nichts geschrieben und eine Warnung protokolliert. Es sind
-- deshalb ZWEI Eigenschaften zu pruefen, nicht eine.
select lives_ok(
  $$ select public.track_usage('c0000000-0000-0000-0000-00000000000c', 'gefaelscht') $$,
  'E2a Aufruf fuer fremden Nutzer bricht nicht ab'
);

select is(
  (select count(*)::int from public.usage_events where event_type = 'gefaelscht'),
  0,
  'E2b Fuer den fremden Nutzer wird nichts geschrieben'
);

-- ============================================================
-- F. is_ancestor_of
-- ============================================================

select tests.authenticate_as('c0000000-0000-0000-0000-00000000000a'); -- ANNA

select ok(
  public.is_ancestor_of('c0000000-0000-0000-0000-00000000000c'),
  'F1 Vorfahre ueber zwei Stufen wird erkannt (Anna zu Clara)'
);

select tests.authenticate_as('c0000000-0000-0000-0000-00000000000c'); -- CLARA

select ok(
  not public.is_ancestor_of('c0000000-0000-0000-0000-00000000000a'),
  'F2 Richtung ist eindeutig: Clara ist kein Vorfahre von Anna'
);

select tests.authenticate_as('c0000000-0000-0000-0000-00000000000b'); -- BERT

select ok(
  not public.is_ancestor_of('c0000000-0000-0000-0000-00000000000f'),
  'F3 Ueber Organisationsgrenzen gibt es keine Vorfahren'
);

-- ============================================================
-- G. match_knowledge: Organisationsparameter haelt jetzt
-- ============================================================

select throws_like(
  $$ select * from public.match_knowledge(
       array_fill(0.0::real, array[1536])::extensions.vector(1536),
       'a0000000-0000-0000-0000-000000000002'::uuid) $$,
  '%fremdes Organisationswissen%',
  'G1 Abfrage mit fremder Organisationskennung wird abgewiesen'
);

-- ============================================================
-- H. Ausfuehrungsrechte
--
-- has_function_privilege beruecksichtigt auch Rechte, die ueber
-- PUBLIC vererbt werden. Genau daran ist [S-1] in Migration 8
-- gescheitert: dort wurde anon entzogen, PUBLIC blieb.
-- ============================================================

reset role;

select is(
  has_function_privilege('anon', 'public.get_downline(uuid)', 'EXECUTE'),
  false,
  'H1 anon hat kein EXECUTE auf get_downline'
);

select is(
  has_function_privilege('anon', 'public.plan_contact_state()', 'EXECUTE'),
  false,
  'H2 anon hat kein EXECUTE auf plan_contact_state'
);

select is(
  has_function_privilege('anon', 'public.coach_messages_today(uuid)', 'EXECUTE'),
  false,
  'H3 anon hat kein EXECUTE auf coach_messages_today'
);

select is(
  has_function_privilege('anon', 'public.track_usage(uuid, text, jsonb)', 'EXECUTE'),
  false,
  'H4 anon hat kein EXECUTE auf track_usage'
);

select is(
  has_function_privilege('anon', 'public.validate_invite(text)', 'EXECUTE'),
  false,
  'H5 anon hat kein EXECUTE auf validate_invite (S-1 aus Migration 8 wirkt jetzt)'
);

select is(
  has_function_privilege('anon', 'public.current_org_id()', 'EXECUTE'),
  true,
  'H6 anon behaelt EXECUTE auf current_org_id, sonst brechen alle RLS-Policies'
);

-- ============================================================
-- I. Haertung search_path
-- ============================================================

-- KORREKTUR aus Sprint 0, Befund B3:
-- Diese Pruefung enthielt die Bedingung `p.prosecdef` und deckte damit nur
-- SECURITY DEFINER Funktionen ab. Genau die vier Funktionen, deren fehlenden
-- search_path F1 nachzieht, sind aber SECURITY INVOKER:
--   event_phase_rank, match_knowledge, protect_profile_columns, set_updated_at
-- Die Pruefung waere deshalb GRUEN geworden, ohne dass die Haertung
-- stattgefunden hat. Ein Test, der falsche Sicherheit gibt, ist schlechter
-- als kein Test. Die Bedingung ist entfernt: geprueft wird jede Funktion
-- in `public`, unabhaengig vom Sicherheitsmodus.
select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and (p.proconfig is null
          or not exists (select 1 from unnest(p.proconfig) c
                         where c like 'search_path=%'))),
  0,
  'I1 Jede Funktion in public hat einen festgenagelten search_path'
);

select ok(
  (select array_to_string(p.proconfig, ',') like '%extensions%'
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'match_knowledge'),
  'I2 match_knowledge hat extensions im search_path, sonst faellt der Vektoroperator aus'
);

-- ============================================================
-- J. Regressionswaechter
--
-- Verhindert, dass F1 in Zukunft erneut entsteht. Jede neue
-- SECURITY DEFINER Funktion mit einem uuid-Parameter muss eine
-- Aufruferpruefung enthalten, sonst wird dieser Test rot.
-- ============================================================

select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
     and pg_get_function_arguments(p.oid) like '%uuid%'
     and pg_get_functiondef(p.oid) !~
         'auth\.uid|is_super_admin|is_platform_super_admin|is_organization_admin|current_org_id|is_ancestor_of'),
  0,
  'J1 Keine SECURITY DEFINER Funktion mit uuid-Parameter ohne Aufruferpruefung'
);

-- ============================================================
-- K. Ende zu Ende: der Tagesplan funktioniert weiterhin
--
-- Wichtigster Nichtregressionstest. Die sechs Planungsfunktionen
-- haben neue Signaturen, generate_daily_plan wurde angepasst.
-- ============================================================

select tests.authenticate_as('c0000000-0000-0000-0000-00000000000b'); -- BERT

select ok(
  public.generate_daily_plan(current_date) is not null,
  'K1 generate_daily_plan liefert weiterhin eine Plankennung'
);

select cmp_ok(
  (select count(*)::int from public.daily_plan_items i
   join public.daily_plans p on p.id = i.plan_id
   where p.user_id = 'c0000000-0000-0000-0000-00000000000b'),
  '>=',
  1,
  'K2 Der erzeugte Tagesplan enthaelt mindestens eine Mission'
);

-- ============================================================

reset role;
select * from finish();
rollback;
