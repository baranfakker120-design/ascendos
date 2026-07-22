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

insert into auth.users (id, email)
values ('c1000000-0000-0000-0000-000000000001', 'phasen@test.local');

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
