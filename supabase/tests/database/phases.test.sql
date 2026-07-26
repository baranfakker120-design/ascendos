-- ============================================================
-- Tests der Phasen-Ableitung (Migration 4): Die Leiter
-- lead -> ... -> fit_check -> three_way_call -> partner muss
-- exakt aus Events entstehen (ADR-003).
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

create schema if not exists tests;

insert into public.organizations (id, name)
values ('a1000000-0000-0000-0000-000000000001', 'PhasenOrg');

insert into public.teams (id, org_id, name)
values ('b1000000-0000-0000-0000-000000000001',
        'a1000000-0000-0000-0000-000000000001', 'PhasenTeam');


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
values ('c1000000-0000-0000-0000-000000000001', 'phasen@test.local');

-- Ab hier wieder vollstaendige Trigger- und Fremdschluesselpruefung.
set local session_replication_role = origin;

insert into public.profiles (id, org_id, team_id, role, first_name, last_name, username)
values ('c1000000-0000-0000-0000-000000000001',
        'a1000000-0000-0000-0000-000000000001',
        'b1000000-0000-0000-0000-000000000001',
        'berater', 'Pia', 'P', 'pia_p');

insert into public.contacts (id, owner_id, org_id, name)
values ('d1000000-0000-0000-0000-000000000001',
        'c1000000-0000-0000-0000-000000000001',
        'a1000000-0000-0000-0000-000000000001', 'Leiter Test');


create or replace function tests.phase_of(cid uuid)
returns text language sql as $$
  select phase from public.contact_phases where contact_id = cid;
$$;

create or replace function tests.add_event(cid uuid, etype text)
returns void language sql as $$
  insert into public.pipeline_events (contact_id, org_id, event_type, created_by)
  values (cid, 'a1000000-0000-0000-0000-000000000001', etype,
          'c1000000-0000-0000-0000-000000000001');
$$;

select is(tests.phase_of('d1000000-0000-0000-0000-000000000001'),
  'lead', 'Neuer Kontakt startet als Lead');

select tests.add_event('d1000000-0000-0000-0000-000000000001', 'presentation_viewed');
select is(tests.phase_of('d1000000-0000-0000-0000-000000000001'),
  'praesentation', 'Präsentation gesehen hebt die Phase');

select tests.add_event('d1000000-0000-0000-0000-000000000001', 'fit_check_sent');
select is(tests.phase_of('d1000000-0000-0000-0000-000000000001'),
  'praesentation', 'Sent-Events dokumentieren, ändern die Phase aber nicht');

select tests.add_event('d1000000-0000-0000-0000-000000000001', 'fit_check_completed');
select tests.add_event('d1000000-0000-0000-0000-000000000001', 'three_way_call_done');
select is(tests.phase_of('d1000000-0000-0000-0000-000000000001'),
  'three_way_call', '3-Way-Call ist eigene Phase nach dem Fit Check');

select tests.add_event('d1000000-0000-0000-0000-000000000001', 'registered');
select is(tests.phase_of('d1000000-0000-0000-0000-000000000001'),
  'partner', 'Registrierung macht den Kontakt zum Partner');

-- Fehl-Tap heilen: Korrektur macht das registered-Event unwirksam.
insert into public.pipeline_events (contact_id, org_id, event_type, source, payload, created_by)
select 'd1000000-0000-0000-0000-000000000001',
       'a1000000-0000-0000-0000-000000000001', 'correction', 'system',
       jsonb_build_object('corrects_event_id', e.id),
       'c1000000-0000-0000-0000-000000000001'
from public.pipeline_events e
where e.contact_id = 'd1000000-0000-0000-0000-000000000001'
  and e.event_type = 'registered';

select is(tests.phase_of('d1000000-0000-0000-0000-000000000001'),
  'three_way_call',
  'Korrektur-Event macht Fehl-Taps unwirksam, Phase fällt korrekt zurück');

select * from finish();

rollback;
