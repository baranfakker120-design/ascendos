-- ============================================================
-- Tests der Regel-Engine (Migration 5): Priorisierung, Idempotenz,
-- automatische Follow-up-Dokumentation und RLS-Grenzen.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

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
values ('a2000000-0000-0000-0000-000000000001', 'EngineOrg');

insert into public.teams (id, org_id, name)
values ('b2000000-0000-0000-0000-000000000001',
        'a2000000-0000-0000-0000-000000000001', 'EngineTeam');


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
insert into auth.users (id, email)
values
  ('c2000000-0000-0000-0000-000000000001', 'engine@test.local'),
  ('c2000000-0000-0000-0000-000000000002', 'engine2@test.local');

-- Ab hier wieder vollstaendige Trigger- und Fremdschluesselpruefung.
set local session_replication_role = origin;

insert into public.profiles (id, org_id, team_id, role, first_name, last_name, username)
values
  ('c2000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000001',
   'b2000000-0000-0000-0000-000000000001',
   'berater', 'Emma', 'E', 'emma_e'),
  ('c2000000-0000-0000-0000-000000000002',
   'a2000000-0000-0000-0000-000000000001',
   'b2000000-0000-0000-0000-000000000001',
   'berater', 'Omar', 'O', 'omar_o');

-- Kontakt A: Fit Check abgeschlossen, kein 3-Way-Call  -> Top-Mission
-- Kontakt B: Präsentation vor 3 Tagen gesendet, nicht angesehen
-- Kontakt C: letzte Aktivität vor 10 Tagen             -> Follow-up
insert into public.contacts (id, owner_id, org_id, name) values
  ('d2000000-0000-0000-0000-00000000000a',
   'c2000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000001', 'Alia Fit'),
  ('d2000000-0000-0000-0000-00000000000b',
   'c2000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000001', 'Bora Praes'),
  ('d2000000-0000-0000-0000-00000000000c',
   'c2000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000001', 'Cem Still');

insert into public.pipeline_events (contact_id, org_id, event_type, created_by, occurred_at)
values
  ('d2000000-0000-0000-0000-00000000000a',
   'a2000000-0000-0000-0000-000000000001', 'fit_check_completed',
   'c2000000-0000-0000-0000-000000000001', now() - interval '1 day'),
  ('d2000000-0000-0000-0000-00000000000b',
   'a2000000-0000-0000-0000-000000000001', 'presentation_sent',
   'c2000000-0000-0000-0000-000000000001', now() - interval '3 days'),
  -- KORREKTUR: Cem braucht ein first_touch-Ereignis.
  --
  -- Belegt: event_phase_rank('contact_created') = 0, waehrend
  -- plan_signal_follow_up `max_rank between 10 and 50` verlangt.
  -- event_phase_rank('first_touch') = 10.
  --
  -- Mit ausschliesslich contact_created traf Cem KEIN Signal: fuer
  -- follow_up_overdue war der Rang zu niedrig, fuer
  -- reactivate_contact sind 10 Tage zu frueh (erst ab 14). Dadurch
  -- entstand keine follow_up_overdue-Mission, die Unterabfrage in
  -- Pruefung 7 lieferte NULL, und update_mission_status(NULL) warf
  -- "Mission nicht gefunden". Pruefungen 8 bis 10 folgten daraus.
  --
  -- Die Regel im Code ist stimmig: Ein Follow-up setzt voraus, dass
  -- es einen ersten Kontakt gab. Angepasst werden die Testdaten,
  -- nicht die Regel.
  ('d2000000-0000-0000-0000-00000000000c',
   'a2000000-0000-0000-0000-000000000001', 'first_touch',
   'c2000000-0000-0000-0000-000000000001', now() - interval '10 days');


-- contact_created-Events (Trigger) zeitlich zurücksetzen, damit die
-- Aktivitäts-Signale greifen (Cem: 10 Tage still).
update public.pipeline_events
set occurred_at = now() - interval '10 days'
where contact_id = 'd2000000-0000-0000-0000-00000000000c';

update public.pipeline_events
set occurred_at = now() - interval '4 days'
where contact_id in ('d2000000-0000-0000-0000-00000000000a',
                     'd2000000-0000-0000-0000-00000000000b')
  and event_type = 'contact_created';

-- ---------- Als Emma ----------

select tests.authenticate_as('c2000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ select public.generate_daily_plan(current_date) $$,
  'Plan-Generierung läuft als eingeloggter Nutzer'
);

select is(
  (select count(*)::int from public.daily_plan_items i
   join public.daily_plans p on p.id = i.plan_id
   where p.user_id = 'c2000000-0000-0000-0000-000000000001'),
  3,
  'Drei echte Kandidaten ergeben drei Missionen (kein künstliches Auffüllen)'
);

select is(
  (select i.mission_type from public.daily_plan_items i
   join public.daily_plans p on p.id = i.plan_id
   where p.user_id = 'c2000000-0000-0000-0000-000000000001'
   order by i.position limit 1),
  'fit_check_next_step',
  'Höchste Priorität: Fit Check ohne 3-Way-Call'
);

-- Idempotenz: zweiter Aufruf erzeugt nichts Neues.
-- HAERTUNG aus Sprint 0: Ein nackter Funktionsaufruf in einer
-- pgTAP-Datei verwandelt einen konkreten Fehler in einen
-- undurchsichtigen Abbruch. Wirft er, bricht die Transaktion ab und
-- ALLE folgenden Pruefungen liefern keine Ausgabe. Das Ergebnis ist
-- dann "planned N but ran M" ohne jeden Hinweis auf die Ursache.
-- In lives_ok gefasst wird daraus eine benannte Pruefung mit
-- Fehlermeldung, und die folgenden Pruefungen laufen weiter.
select lives_ok(
  $$ select public.generate_daily_plan(current_date) $$,
  'Zweiter Aufruf von generate_daily_plan bricht nicht ab'
);
select is(
  (select count(*)::int from public.daily_plans
   where user_id = 'c2000000-0000-0000-0000-000000000001'),
  1,
  'generate_daily_plan ist idempotent (ein Plan pro Tag)'
);

-- Commit
select lives_ok(
  $$ select public.commit_daily_plan(
       (select id from public.daily_plans
        where user_id = 'c2000000-0000-0000-0000-000000000001'
          and plan_date = current_date)) $$,
  'Plan lässt sich committen'
);

-- "Erledigt" auf der Follow-up-Mission dokumentiert automatisch
-- ein follow_up-Event auf Cem.
select lives_ok(
  $$ select public.update_mission_status(
       (select i.id from public.daily_plan_items i
        join public.daily_plans p on p.id = i.plan_id
        where p.user_id = 'c2000000-0000-0000-0000-000000000001'
          and i.mission_type = 'follow_up_overdue'),
       'done') $$,
  'Mission auf erledigt setzen bricht nicht ab'
);

select is(
  (select count(*)::int from public.pipeline_events
   where contact_id = 'd2000000-0000-0000-0000-00000000000c'
     and event_type = 'follow_up' and source = 'system'),
  1,
  'Erledigte Follow-up-Mission dokumentiert das Event automatisch'
);

select is(
  (select count(*)::int from public.usage_events
   where user_id = 'c2000000-0000-0000-0000-000000000001'
     and event_type in ('plan_committed', 'mission_completed')),
  2,
  'Commit und erledigte Mission werden serverseitig getrackt (ADR-016)'
);

select is(
  (select status from public.daily_plan_items i
   join public.daily_plans p on p.id = i.plan_id
   where p.user_id = 'c2000000-0000-0000-0000-000000000001'
     and i.mission_type = 'follow_up_overdue'),
  'done',
  'Missions-Status wird persistiert'
);

-- ---------- Als Omar (leere Pipeline, fremder Plan) ----------

select tests.authenticate_as('c2000000-0000-0000-0000-000000000002');

select is(
  (select count(*)::int from public.daily_plan_items),
  0,
  'Omar sieht keine Missionen von Emma (RLS)'
);

select lives_ok(
  $$ select public.generate_daily_plan(current_date) $$,
  'Plan nach Statuswechsel neu erzeugen bricht nicht ab'
);

select is(
  (select i.mission_type from public.daily_plan_items i
   join public.daily_plans p on p.id = i.plan_id
   where p.user_id = 'c2000000-0000-0000-0000-000000000002'),
  'new_contacts',
  'Leere Pipeline: genau eine ehrliche Aufbau-Mission, kein Fake-Plan'
);

select * from finish();

rollback;
