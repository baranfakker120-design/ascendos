-- ============================================================
-- Tests Sprint 5: Tages-Freischaltung, Sponsor sieht NUR
-- Fortschritt der Firstline, Achievement-Evaluator.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

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

-- ---------- Szenario ----------
insert into public.organizations (id, name)
values ('a3000000-0000-0000-0000-000000000001', 'JourneyOrg');

insert into public.teams (id, org_id, name)
values ('b3000000-0000-0000-0000-000000000001',
        'a3000000-0000-0000-0000-000000000001', 'JourneyTeam');


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
  ('c3000000-0000-0000-0000-000000000001', 'sponsor@test.local'),
  ('c3000000-0000-0000-0000-000000000002', 'neuling@test.local'),
  ('c3000000-0000-0000-0000-000000000003', 'fremder@test.local');

-- Ab hier wieder vollstaendige Trigger- und Fremdschluesselpruefung.
set local session_replication_role = origin;

insert into public.profiles (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('c3000000-0000-0000-0000-000000000001',
   'a3000000-0000-0000-0000-000000000001',
   'b3000000-0000-0000-0000-000000000001',
   null, 'berater', 'Selin', 'S', 'selin_s'),
  ('c3000000-0000-0000-0000-000000000002',
   'a3000000-0000-0000-0000-000000000001',
   'b3000000-0000-0000-0000-000000000001',
   'c3000000-0000-0000-0000-000000000001', 'berater', 'Nuri', 'N', 'nuri_n'),
  ('c3000000-0000-0000-0000-000000000003',
   'a3000000-0000-0000-0000-000000000001',
   'b3000000-0000-0000-0000-000000000001',
   null, 'berater', 'Faruk', 'F', 'faruk_f');

insert into public.journeys (id, org_id, team_id, title)
values ('e3000000-0000-0000-0000-000000000001',
        'a3000000-0000-0000-0000-000000000001',
        'b3000000-0000-0000-0000-000000000001', 'Testreise');

insert into public.journey_steps (id, journey_id, day_number, step_order, title) values
  ('f3000000-0000-0000-0000-000000000001',
   'e3000000-0000-0000-0000-000000000001', 1, 1, 'Tag1 Schritt1'),
  ('f3000000-0000-0000-0000-000000000002',
   'e3000000-0000-0000-0000-000000000001', 1, 2, 'Tag1 Schritt2'),
  ('f3000000-0000-0000-0000-000000000003',
   'e3000000-0000-0000-0000-000000000001', 2, 1, 'Tag2 Schritt1');

insert into public.achievements (id, org_id, key, title, description, condition)
values ('a4000000-0000-0000-0000-000000000001',
        'a3000000-0000-0000-0000-000000000001',
        'startklar_test', 'Startklar', 'Reise fertig',
        '{"type": "journey_completed"}');


-- ---------- Als Nuri (Neuling) ----------
select tests.authenticate_as('c3000000-0000-0000-0000-000000000002');

select throws_like(
  $$ select public.complete_journey_step('f3000000-0000-0000-0000-000000000003') $$,
  '%noch nicht freigeschaltet%',
  'Tag 2 ist gesperrt, solange Tag 1 offen ist'
);

select lives_ok(
  $$ select public.complete_journey_step('f3000000-0000-0000-0000-000000000001') $$,
  'Tag-1-Schritt lässt sich abschließen'
);

select is(
  (select count(*)::int from public.check_achievements()),
  0,
  'Evaluator schaltet nichts frei, solange die Reise unvollständig ist'
);

-- HAERTUNG aus Sprint 0: Ein nackter Funktionsaufruf in einer
-- pgTAP-Datei verwandelt einen konkreten Fehler in einen
-- undurchsichtigen Abbruch. Wirft er, bricht die Transaktion ab und
-- ALLE folgenden Pruefungen liefern keine Ausgabe. Das Ergebnis ist
-- dann "planned N but ran M" ohne jeden Hinweis auf die Ursache.
-- In lives_ok gefasst wird daraus eine benannte Pruefung mit
-- Fehlermeldung, und die folgenden Pruefungen laufen weiter.
select lives_ok(
  $$ select public.complete_journey_step('f3000000-0000-0000-0000-000000000002') $$,
  'Zweiter Tag-1-Schritt laesst sich abschliessen'
);

select lives_ok(
  $$ select public.complete_journey_step('f3000000-0000-0000-0000-000000000003') $$,
  'Nach Tag 1 ist Tag 2 freigeschaltet'
);

select is(
  (select count(*)::int from public.check_achievements()),
  1,
  'Vollständige Reise schaltet das journey_completed-Achievement frei'
);

select is(
  (select count(*)::int from public.check_achievements()),
  0,
  'Evaluator ist idempotent (keine Doppel-Freischaltung)'
);

-- ---------- Als Selin (Sponsor) ----------
select tests.authenticate_as('c3000000-0000-0000-0000-000000000001');

select is(
  (select completed_steps::int from public.firstline_journey_progress
   where user_id = 'c3000000-0000-0000-0000-000000000002'),
  3,
  'Sponsor sieht den Fortschritt seiner Firstline (3 von 3 Schritten)'
);

-- ---------- Als Faruk (KEIN Sponsor von Nuri) ----------
select tests.authenticate_as('c3000000-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.user_progress
   where user_id = 'c3000000-0000-0000-0000-000000000002'),
  0,
  'Nicht-Sponsoren sehen fremden Fortschritt NICHT (RLS-Grenze)'
);

select * from finish();

rollback;
