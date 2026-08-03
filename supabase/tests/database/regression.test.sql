-- ============================================================
-- F1: Regressionstest der Kernfunktionen (pgTAP)
-- Ausführen mit: npm run db:test
--
-- Zweck: Nachweis, dass die Sicherheitsmigration
-- 20260730000012_f1_function_security.sql keine bestehende
-- Funktion beschädigt hat.
--
-- Abgedeckt sind alle Kernfunktionen, die auf Datenbankebene
-- prüfbar sind. Login, Dashboard und Leaderansichten sind hier
-- NICHT prüfbar und stehen im Release-Report unter den manuell
-- zu verifizierenden Punkten.
--
-- Besonderheit: Die Registrierung wird über den ECHTEN
-- Trigger-Pfad geprüft, nicht simuliert. Das ist der wichtigste
-- Nichtregressionsnachweis, weil handle_new_user der einzige
-- Weg ist, auf dem ein Profil regulär entsteht.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

-- ---------- Aufbau: Trigger stillgelegt ----------

insert into public.organizations (id, name) values
  ('a1000000-0000-0000-0000-000000000001', 'RegTestOrg'),
  ('a1000000-0000-0000-0000-000000000002', 'RegFremdOrg');

insert into public.teams (id, org_id, name) values
  ('b1000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', 'RegTeam'),
  ('b1000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000002', 'RegFremdTeam');

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
  ('c1000000-0000-0000-0000-00000000000a', 'reg-anna@test.local'),
  ('c1000000-0000-0000-0000-00000000000b', 'reg-bert@test.local'),
  ('c1000000-0000-0000-0000-00000000000e', 'reg-leo@test.local'),
  ('c1000000-0000-0000-0000-00000000000f', 'reg-emil@test.local');

-- Ab hier wieder vollstaendige Trigger- und Fremdschluesselpruefung.
set local session_replication_role = origin;

insert into public.profiles
  (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('c1000000-0000-0000-0000-00000000000a',
   'a1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001',
   null, 'super_admin', 'RegAnna', 'Admin', 'reganna'),
  ('c1000000-0000-0000-0000-00000000000b',
   'a1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-00000000000a', 'berater', 'RegBert', 'Berater', 'regbert'),
  ('c1000000-0000-0000-0000-00000000000e',
   'a1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-00000000000a', 'leader', 'RegLeo', 'Leader', 'regleo'),
  ('c1000000-0000-0000-0000-00000000000f',
   'a1000000-0000-0000-0000-000000000002',
   'b1000000-0000-0000-0000-000000000002',
   null, 'berater', 'RegEmil', 'Extern', 'regemil');

-- Mitgliedschaften + Genealogie (create_invite / Downline brauchen sie).
set local session_replication_role = replica;
insert into public.memberships (identity_id, org_id, team_id, role, status)
select p.id, p.org_id, p.team_id, p.role, 'active'
from public.profiles p
where p.id::text like 'c1000000%'
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
  and p.id::text like 'c1000000%' and p.sponsor_id is not null;
set local session_replication_role = origin;

-- ZWEI Einladungen, und das ist keine Redundanz:
-- REGTEST001 wird in Abschnitt A durch die echte Registrierung
-- VERBRAUCHT. validate_invite filtert auf `used_at is null` und
-- liefert fuer eine verbrauchte Einladung keine Zeile. Abschnitt B
-- braucht deshalb eine eigene, unverbrauchte Einladung.
insert into public.invites (code, org_id, team_id, sponsor_id, role, created_by)
values ('REGTEST001',
        'a1000000-0000-0000-0000-000000000001',
        'b1000000-0000-0000-0000-000000000001',
        'c1000000-0000-0000-0000-00000000000b', 'berater',
        'c1000000-0000-0000-0000-00000000000b'),
       ('REGTEST002',
        'a1000000-0000-0000-0000-000000000001',
        'b1000000-0000-0000-0000-000000000001',
        'c1000000-0000-0000-0000-00000000000b', 'berater',
        'c1000000-0000-0000-0000-00000000000b');

-- Wissensdokumente: eines freigegeben, eines Entwurf
insert into public.knowledge_docs (id, org_id, title, category, status)
values
  ('e1000000-0000-0000-0000-000000000001',
   'a1000000-0000-0000-0000-000000000001', 'Freigegeben', 'produkte', 'approved'),
  ('e1000000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000001', 'Entwurf', 'produkte', 'draft'),
  ('e1000000-0000-0000-0000-000000000003',
   'a1000000-0000-0000-0000-000000000002', 'FremdesWissen', 'produkte', 'approved');

insert into public.knowledge_chunks (doc_id, org_id, chunk_index, content, embedding)
values ('e1000000-0000-0000-0000-000000000001',
        'a1000000-0000-0000-0000-000000000001', 0, 'Testinhalt',
        array_fill(0.1::real, array[1536])::extensions.vector(1536));

insert into public.contacts (id, org_id, owner_id, name)
values ('d1000000-0000-0000-0000-00000000000b',
        'a1000000-0000-0000-0000-000000000001',
        'c1000000-0000-0000-0000-00000000000b', 'RegKontakt');


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
-- A. Registrierung über den echten Trigger-Pfad
-- ============================================================

select lives_ok(
  $$ insert into auth.users (id, email, raw_user_meta_data)
     values ('c1000000-0000-0000-0000-00000000000c', 'reg-clara@test.local',
             '{"invite_code":"REGTEST001","username":"regclara",
               "first_name":"RegClara","last_name":"Neu"}'::jsonb) $$,
  'A1 Registrierung mit gueltigem Einladungscode funktioniert weiterhin'
);

select is(
  (select username from public.profiles
   where id = 'c1000000-0000-0000-0000-00000000000c'),
  'regclara',
  'A2 handle_new_user hat das Profil korrekt aus der Einladung erzeugt'
);

select isnt(
  (select used_at from public.invites where code = 'REGTEST001'),
  null,
  'A3 Die Einladung ist danach als verbraucht markiert'
);

-- ============================================================
-- B. Invite-System
-- ============================================================

select tests.authenticate_as('c1000000-0000-0000-0000-00000000000b'); -- BERT

select isnt(
  (select invite_code from public.create_invite('berater') limit 1),
  null,
  'B1 create_invite erzeugt weiterhin einen Code'
);

reset role; -- validate_invite laeuft nur ueber service_role, siehe Migration 12

select is(
  (select org_name from public.validate_invite('REGTEST002')),
  'RegTestOrg',
  'B2 validate_invite liefert weiterhin die Organisationsdaten (unverbrauchte Einladung)'
);

-- ============================================================
-- C. Pipeline
-- ============================================================

select tests.authenticate_as('c1000000-0000-0000-0000-00000000000b'); -- BERT

select is(
  (select count(*)::int from public.pipeline_events
   where contact_id = 'd1000000-0000-0000-0000-00000000000b'
     and event_type = 'contact_created'),
  1,
  'C1 log_contact_created erzeugt weiterhin automatisch das Anlage-Ereignis'
);

select is(
  (select phase from public.contact_phases
   where contact_id = 'd1000000-0000-0000-0000-00000000000b'),
  'lead',
  'C2 contact_phases leitet die Phase weiterhin korrekt ab'
);

-- KORREKTUR: Das Ereignis muss korrigierbar sein.
--
-- Belegt: correct_pipeline_event verweigert ausdruecklich
--   if v_event.event_type in ('correction', 'contact_created') then
--     raise exception 'AscendOS: Dieses Ereignis kann nicht korrigiert werden.';
--
-- Der vorige Test nahm `limit 1` von den Ereignissen des Kontakts.
-- Das einzige dort ist das automatische contact_created, also genau
-- das, was die Funktion absichtlich ablehnt. Der Code ist richtig,
-- der Test war falsch.
--
-- Es wird deshalb zuerst ein korrigierbares Ereignis erzeugt und
-- gezielt dieses korrigiert.
insert into public.pipeline_events (contact_id, org_id, event_type, created_by)
values ('d1000000-0000-0000-0000-00000000000b',
        'a1000000-0000-0000-0000-000000000001', 'first_touch',
        'c1000000-0000-0000-0000-00000000000b');

select lives_ok(
  $$ select public.correct_pipeline_event(
       (select id from public.pipeline_events
        where contact_id = 'd1000000-0000-0000-0000-00000000000b'
          and event_type = 'first_touch')) $$,
  'C3 correct_pipeline_event funktioniert weiterhin'
);

-- ============================================================
-- D. Daily Plan, betroffen durch die neuen Signaturen
-- ============================================================

select ok(
  public.generate_daily_plan(current_date) is not null,
  'D1 generate_daily_plan erzeugt weiterhin einen Plan'
);

select lives_ok(
  $$ select public.commit_daily_plan(
       (select id from public.daily_plans
        where user_id = 'c1000000-0000-0000-0000-00000000000b' limit 1)) $$,
  'D2 commit_daily_plan funktioniert weiterhin'
);

select lives_ok(
  $$ select public.update_mission_status(
       (select i.id from public.daily_plan_items i
        join public.daily_plans p on p.id = i.plan_id
        where p.user_id = 'c1000000-0000-0000-0000-00000000000b' limit 1),
       'done') $$,
  'D3 update_mission_status funktioniert weiterhin'
);

-- ============================================================
-- E. Coach und Wissensdatenbank
-- ============================================================

select is(
  public.coach_messages_today('c1000000-0000-0000-0000-00000000000b'),
  0,
  'E1 coach_messages_today zaehlt die eigenen Nachrichten weiterhin'
);

select is(
  (select count(*)::int from public.knowledge_docs
   where title = 'Freigegeben'),
  1,
  'E2 Berater sieht freigegebene Dokumente'
);

select is(
  (select count(*)::int from public.knowledge_docs
   where title = 'Entwurf'),
  0,
  'E3 Berater sieht Entwuerfe NICHT (Freigabepflicht haelt)'
);

-- ============================================================
-- F. Knowledge Retrieval, betroffen durch search_path-Aenderung
--
-- Kritischster Regressionstest der ganzen Migration: Der Operator
-- <=> liegt im Schema extensions. Waere der search_path falsch
-- gesetzt, faellt die Wissenssuche vollstaendig aus.
-- ============================================================

select is(
  (select count(*)::int from public.match_knowledge(
     array_fill(0.1::real, array[1536])::extensions.vector(1536),
     'a1000000-0000-0000-0000-000000000001'::uuid)),
  1,
  'F1 match_knowledge findet den eigenen Chunk, Vektoroperator funktioniert'
);

-- ============================================================
-- G. Teamstruktur
-- ============================================================

select is(
  (select count(*)::int from public.get_downline('c1000000-0000-0000-0000-00000000000b')),
  1,
  'G1 get_downline liefert die eigene Downline (Clara aus Abschnitt A)'
);

select cmp_ok(
  (select count(*)::int from public.profiles_public),
  '>=',
  4,
  'G2 profiles_public liefert weiterhin die Teamliste der eigenen Organisation'
);

-- ============================================================
-- H. Aktivitaeten
-- ============================================================

select lives_ok(
  $$ insert into public.usage_events (user_id, org_id, event_type)
     values ('c1000000-0000-0000-0000-00000000000b',
             'a1000000-0000-0000-0000-000000000001', 'app_opened') $$,
  'H1 Aktivitaetsereignisse koennen weiterhin fuer sich selbst geschrieben werden'
);

-- ============================================================
-- I. Berechtigungen
-- ============================================================

select throws_like(
  $$ update public.profiles set role = 'super_admin'
     where id = 'c1000000-0000-0000-0000-00000000000b' $$,
  '%können nicht selbst geändert werden%',
  'I1 Selbstbefoerderung bleibt blockiert, protect_profile_columns wirkt'
);

select tests.authenticate_as('c1000000-0000-0000-0000-00000000000e'); -- LEO, leader

select is(
  (select count(*)::int from public.contacts),
  0,
  'I2 Die Rolle leader hat weiterhin KEINEN erweiterten Zugriff (Zustand vor F2)'
);

-- ============================================================
-- J. Mehrmandantenfaehigkeit
-- ============================================================

select tests.authenticate_as('c1000000-0000-0000-0000-00000000000f'); -- EMIL, fremde Org

select is(
  (select count(*)::int from public.contacts),
  0,
  'J1 Fremde Organisation sieht keine Kontakte'
);

select is(
  (select count(*)::int from public.profiles_public
   where org_id = 'a1000000-0000-0000-0000-000000000001'),
  0,
  'J2 Fremde Organisation sieht keine Profile der Testorganisation'
);

select is(
  (select count(*)::int from public.knowledge_docs
   where org_id = 'a1000000-0000-0000-0000-000000000001'),
  0,
  'J3 Fremde Organisation sieht kein fremdes Wissen'
);

-- ============================================================

reset role;
select * from finish();
rollback;
