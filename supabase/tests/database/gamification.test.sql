-- ============================================================
-- Sprint 4: Gamification-Fundament (pgTAP)
-- Prueft Migration 20260805000018_gamification_foundation.sql
--
-- WICHTIGE FALLE, hier ausdruecklich beruecksichtigt:
-- Ein einzelner INSERT in `contacts` loest ZWEI Ereignisse aus:
--   1. log_contact_created -> pipeline_events(event_type='contact_created')
--   2. track_usage        -> usage_events(event_type='contact_created')
-- Beide koennen Punkte tragen. In dieser Suite bleiben beide Regeln
-- deshalb bei ap = 0, ausser wo das Doppelzaehlen ausdruecklich
-- geprueft wird (Abschnitt N). Ohne diese Vorsicht waere jede
-- erwartete Punktsumme falsch, ohne dass der Grund sichtbar wuere.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(94);

-- ============================================================
-- Aufbau
-- ============================================================

set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('d1000000-0000-0000-0000-00000000000a', 's4-anna@test.local'),
  ('d1000000-0000-0000-0000-00000000000b', 's4-bert@test.local'),
  ('d1000000-0000-0000-0000-00000000000c', 's4-clara@test.local'),
  ('d1000000-0000-0000-0000-00000000000e', 's4-emil@test.local');
set local session_replication_role = origin;

insert into public.organizations (id, name) values
  ('a1000000-0000-0000-0000-000000000001', 'S4 TestOrg'),
  ('a1000000-0000-0000-0000-000000000002', 'S4 FremdOrg');

insert into public.teams (id, org_id, name) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'S4 Team'),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'S4 FremdTeam');

insert into public.profiles (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('d1000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001', null,'super_admin','S4Anna','A','s4anna'),
  ('d1000000-0000-0000-0000-00000000000b','a1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-00000000000a','berater','S4Bert','B','s4bert'),
  ('d1000000-0000-0000-0000-00000000000c','a1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-00000000000a','berater','S4Clara','C','s4clara'),
  ('d1000000-0000-0000-0000-00000000000e','a1000000-0000-0000-0000-000000000002',
   'b1000000-0000-0000-0000-000000000002', null,'berater','S4Emil','E','s4emil');

-- Mitgliedschaften (Migration 15 legt sie fuer Bestandsprofile an,
-- fuer hier neu angelegte muss der Umzug nachgezogen werden).
-- Unter replica: sync_profile_mirror darf profiles.sponsor_id nicht
-- vor der Genealogie-Aktualisierung loeschen; protect blockiert sonst.
set local session_replication_role = replica;
insert into public.memberships (identity_id, org_id, team_id, role, status)
select p.id, p.org_id, p.team_id, p.role, 'active'
from public.profiles p
where p.id::text like 'd1000000%'
  and not exists (select 1 from public.memberships m
                  where m.identity_id=p.id and m.org_id=p.org_id and m.status='active');

update public.memberships m set sponsor_membership_id = sp.id
from public.profiles p
join public.memberships sp on sp.identity_id=p.sponsor_id and sp.org_id=p.org_id and sp.status='active'
where m.identity_id=p.id and m.org_id=p.org_id and m.status='active'
  and p.id::text like 'd1000000%' and p.sponsor_id is not null;
set local session_replication_role = origin;

-- ---------- Startdaten, WORTGETREU aus Migration 18 ----------
-- Bewusst dieselben INSERTs: damit prueft diese Suite auch die
-- Startdaten selbst und nicht nur eine Nachbildung.
insert into public.ranks (org_id, key, label, threshold_ap, frame_asset, payout_cents, payout_kind, sort_order)
select o.id, v.key, v.label, v.threshold, v.frame, v.cents, v.pkind, v.ord
from public.organizations o
cross join (values
  ('newcomer','Newcomer',0,'frame-01',null::integer,null::text,1),
  ('active','Active',250,'frame-02',null,null,2),
  ('consistent','Consistent',1250,'frame-03',null,null,3),
  ('elite','Elite',5000,'frame-04',null,null,4),
  ('legend','Legend',15000,'frame-05',null,null,5),
  ('team_leader','Team Leader',30000,'frame-06',10000,'team_leader_bonus',6),
  ('mentor','Mentor',50000,'frame-07',null,null,7)
) as v(key,label,threshold,frame,cents,pkind,ord)
where o.id::text like 'a1000000%'
on conflict (org_id, key) do nothing;

insert into public.cosmetic_items (org_id, kind, key, label, asset_path, rank_key, sort_order)
select r.org_id, 'frame', 'rank-'||r.key, r.label||' Rahmen', r.frame_asset, r.key, r.sort_order
from public.ranks r where r.org_id::text like 'a1000000%'
on conflict (org_id, kind, key) do nothing;

insert into public.ap_rules (org_id, source_kind, event_type, ap, note)
select o.id, 'pipeline_event', v.et, 0, 'Test'
from public.organizations o
cross join (values
  ('contact_created'),('first_touch'),('follow_up'),('presentation_sent'),
  ('presentation_viewed'),('fit_check_sent'),('fit_check_completed'),
  ('waytomoon_sent'),('three_way_call_done'),('party_scheduled'),
  ('party_done'),('became_customer'),('registered')
) as v(et)
where o.id::text like 'a1000000%'
on conflict do nothing;

insert into public.ap_rules (org_id, source_kind, event_type, ap, note)
select o.id, 'usage_event', v.et, 0, 'Test'
from public.organizations o
cross join (values
  ('app_opened'),('coach_message_sent'),('contact_created'),
  ('journey_step_completed'),('mission_skipped'),('plan_committed')
) as v(et)
where o.id::text like 'a1000000%'
on conflict do nothing;

-- Fuer die Punktetests: NUR follow_up traegt Punkte.
update public.ap_rules set ap = 50
where org_id = 'a1000000-0000-0000-0000-000000000001'
  and source_kind = 'pipeline_event' and event_type = 'follow_up';

create schema if not exists tests;
grant usage on schema tests to authenticated;

create or replace function tests.authenticate_as(user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
end;
$$;

create or replace function tests.clear_org()
returns void language plpgsql as $$
begin perform set_config('request.headers','{}', true); end;
$$;

/** Kontakt fuer Ereignistests. contact_created traegt hier 0 Punkte,
 *  die beiden automatischen Ereignisse bleiben daher wirkungslos. */
create or replace function tests.make_contact(p_owner uuid, p_org uuid, p_name text)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.contacts (org_id, owner_id, name) values (p_org, p_owner, p_name)
  returning id into v_id;
  return v_id;
end;
$$;

/** Mitgliedschaftskennung, kurz.
 *
 *  ACHTUNG, hier lag ein Fehler: ohne `order by` war diese Funktion
 *  mehrdeutig, sobald eine Person ZWEI aktive Mitgliedschaften hat
 *  (Abschnitt I). Alle spaeteren Pruefungen haetten dann zufaellig die
 *  eine oder die andere getroffen. Die Sortierung nach org_id macht sie
 *  deterministisch: TestOrg (...0001) kommt vor FremdOrg (...0002),
 *  und genau das ist ueberall gemeint. */
create or replace function tests.mid(p_username text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id from public.memberships m
  join public.profiles p on p.id = m.identity_id
  where p.username = p_username and m.status = 'active'
  order by m.org_id::text
  limit 1;
$$;

grant execute on function tests.mid(text) to authenticated;


-- ============================================================
-- A. Struktur
-- ============================================================

select has_column('public','memberships','ap_total',
  'A1 memberships.ap_total existiert');

select is(
  (select count(*)::int from information_schema.tables where table_schema='public'
   and table_name in ('seasons','ap_rules','ap_ledger','ranks','cosmetic_items',
                      'membership_cosmetics','payouts','monthly_awards')),
  8, 'A2 Alle acht neuen Tabellen existieren');

select is(
  (select count(*)::int from pg_indexes where schemaname='public'
   and indexname in ('ap_ledger_once_per_event_rule','membership_cosmetics_one_equipped_per_kind',
                     'ap_rules_one_active','memberships_ap_total_idx')),
  4, 'A3 Die vier tragenden Indizes existieren');

select is(
  (select count(*)::int from pg_constraint
   where conrelid='public.payouts'::regclass and contype='u'
     and pg_get_constraintdef(oid) like '%identity_id%kind%'),
  1, 'A4 payouts traegt UNIQUE (identity_id, kind)');

select is(
  (select count(*)::int from pg_class c
   where c.relname in ('seasons','ap_rules','ap_ledger','ranks','cosmetic_items',
                       'membership_cosmetics','payouts','monthly_awards')
     and c.relrowsecurity),
  8, 'A5 Zeilenrechte auf allen acht Tabellen aktiv');

select is(
  (select count(*)::int from public.ranks where org_id='a1000000-0000-0000-0000-000000000001'),
  7, 'A6 Startdaten legen genau sieben Raenge an');

select is(
  (select payout_cents from public.ranks
   where org_id='a1000000-0000-0000-0000-000000000001' and key='team_leader'),
  10000, 'A7 Team Leader traegt 10000 Cent, nicht im Code');

select is(
  (select count(*)::int from public.ranks
   where org_id='a1000000-0000-0000-0000-000000000001' and payout_cents is not null),
  1, 'A8 Genau EIN Rang traegt eine Belohnung');

select is(
  (select count(*)::int from public.ap_rules where org_id='a1000000-0000-0000-0000-000000000001'),
  19, 'A9 Startdaten legen 19 Punkteregeln an (13 pipeline + 6 usage)');

select is(
  (select count(*)::int from public.ap_rules
   where org_id='a1000000-0000-0000-0000-000000000001' and ap <> 0 and event_type <> 'follow_up'),
  0, 'A10 Alle Regeln ausser der Testregel stehen auf 0');

select throws_ok(
  $$ insert into public.ranks (org_id, key, label, threshold_ap, payout_cents)
     values ('a1000000-0000-0000-0000-000000000001','kaputt','Kaputt',999,500) $$,
  '23514', null,
  'A11 Betrag ohne Auszahlungsart wird abgewiesen (CHECK)');

select throws_ok(
  $$ insert into public.ranks (org_id, key, label, threshold_ap)
     values ('a1000000-0000-0000-0000-000000000001','doppelt','Doppelt',250) $$,
  '23505', null,
  'A12 Zwei Raenge auf derselben Schwelle sind ausgeschlossen');


-- ============================================================
-- B. Punktevergabe aus pipeline_events
-- ============================================================

select lives_ok(
  $$ select tests.make_contact('d1000000-0000-0000-0000-00000000000b',
       'a1000000-0000-0000-0000-000000000001', 'S4 Kontakt Bert') $$,
  'B1 Kontakt anlegen laeuft durch (loest zwei Ereignisse aus)');

select is(
  (select ap_total from public.memberships where id = tests.mid('s4bert')),
  0, 'B2 contact_created mit ap=0 bucht nichts, obwohl ZWEI Ereignisse entstanden');

select lives_ok(
  $$ insert into public.pipeline_events (contact_id, org_id, event_type, source, created_by)
     select c.id, c.org_id, 'follow_up', 'manual', c.owner_id
     from public.contacts c where c.name = 'S4 Kontakt Bert' $$,
  'B3 follow_up-Ereignis laeuft durch');

select is(
  (select ap_total from public.memberships where id = tests.mid('s4bert')),
  50, 'B4 follow_up bucht 50 AP auf die Mitgliedschaft');

select is(
  (select count(*)::int from public.ap_ledger where membership_id = tests.mid('s4bert')),
  1, 'B5 Genau eine Registerbuchung');

select is(
  (select source_kind from public.ap_ledger where membership_id = tests.mid('s4bert')),
  'pipeline_event', 'B6 Buchung tragt die Herkunft pipeline_event');

select isnt(
  (select rule_id from public.ap_ledger where membership_id = tests.mid('s4bert')),
  null, 'B7 Buchung verweist auf die angewandte Regel');

select is(
  (select ap_total from public.memberships where id = tests.mid('s4clara')),
  0, 'B8 Fremde Mitgliedschaft bleibt unberuehrt');


-- ============================================================
-- C. Korrekturen als Gegenbuchung
-- ============================================================

select lives_ok(
  $$ insert into public.pipeline_events (contact_id, org_id, event_type, source, payload, created_by)
     select e.contact_id, e.org_id, 'correction', 'system',
            jsonb_build_object('corrects_event_id', e.id, 'corrected_event_type', 'follow_up'),
            e.created_by
     from public.pipeline_events e
     where e.event_type='follow_up' and e.created_by='d1000000-0000-0000-0000-00000000000b' $$,
  'C1 Korrekturereignis laeuft durch');

select is(
  (select ap_total from public.memberships where id = tests.mid('s4bert')),
  0, 'C2 Korrektur nimmt die 50 AP zurueck');

select is(
  (select count(*)::int from public.ap_ledger
   where membership_id = tests.mid('s4bert') and delta < 0),
  1, 'C3 Genau eine Gegenbuchung entstanden');

select is(
  (select source_kind from public.ap_ledger
   where membership_id = tests.mid('s4bert') and delta < 0),
  'correction', 'C4 Gegenbuchung tragt die Herkunft correction');

select is(
  (select count(*)::int from public.ap_ledger where membership_id = tests.mid('s4bert')),
  2, 'C5 Register haelt BEIDE Buchungen -- nichts wurde geloescht');

-- Korrektur ohne corrected_event_type darf nichts buchen.
select lives_ok(
  $$ insert into public.pipeline_events (contact_id, org_id, event_type, source, payload, created_by)
     select c.id, c.org_id, 'correction', 'system', '{}'::jsonb, c.owner_id
     from public.contacts c where c.name='S4 Kontakt Bert' $$,
  'C6 Korrektur ohne Angabe der Ereignisart laeuft durch');

select is(
  (select count(*)::int from public.ap_ledger where membership_id = tests.mid('s4bert')),
  2, 'C7 ... und bucht nichts');


-- ============================================================
-- D. Idempotenz
-- ============================================================

-- Ein zweites, EIGENES follow_up-Ereignis muss buchen (andere Quelle).
select lives_ok(
  $$ insert into public.pipeline_events (contact_id, org_id, event_type, source, created_by)
     select c.id, c.org_id, 'follow_up', 'manual', c.owner_id
     from public.contacts c where c.name='S4 Kontakt Bert' $$,
  'D1 Zweites follow_up laeuft durch');

select is(
  (select ap_total from public.memberships where id = tests.mid('s4bert')),
  50, 'D2 Zweites follow_up bucht erneut 50 AP (eigenes Ereignis, kein Duplikat)');

-- Dieselbe Buchung von Hand nachschieben muss scheitern.
select throws_ok(
  $$ insert into public.ap_ledger (membership_id, delta, reason, rule_id, source_kind, source_event_id)
     select l.membership_id, l.delta, l.reason, l.rule_id, l.source_kind, l.source_event_id
     from public.ap_ledger l
     where l.membership_id = tests.mid('s4bert') and l.delta > 0 limit 1 $$,
  '23505', null,
  'D3 Zweite Buchung fuer dasselbe Ereignis und dieselbe Regel wird abgewiesen');


-- ============================================================
-- E. Rangfunktionen
-- ============================================================

select is(
  (select key from public.rank_for_ap('a1000000-0000-0000-0000-000000000001', 0)),
  'newcomer', 'E1 0 AP ergibt Newcomer');

select is(
  (select key from public.rank_for_ap('a1000000-0000-0000-0000-000000000001', 249)),
  'newcomer', 'E2 249 AP ergibt noch Newcomer (Grenzfall unterhalb)');

select is(
  (select key from public.rank_for_ap('a1000000-0000-0000-0000-000000000001', 250)),
  'active', 'E3 250 AP ergibt Active (Grenzfall genau auf der Schwelle)');

select is(
  (select key from public.rank_for_ap('a1000000-0000-0000-0000-000000000001', 999999)),
  'mentor', 'E4 Sehr hoher Stand ergibt den hoechsten Rang');

select is(
  (select threshold_ap from public.next_rank_for_ap('a1000000-0000-0000-0000-000000000001', 250)),
  1250, 'E5 Naechste Schwelle nach Active ist 1250');

select is(
  (select count(*)::int from public.next_rank_for_ap('a1000000-0000-0000-0000-000000000001', 50000)),
  0, 'E6 Beim hoechsten Rang gibt es keine naechste Schwelle');


-- ============================================================
-- F. Kosmetik-Freischaltung
-- ============================================================

select is(
  (select count(*)::int from public.membership_cosmetics where membership_id = tests.mid('s4bert')),
  1, 'F1 Bei 50 AP ist genau der Newcomer-Rahmen freigeschaltet');

select is(
  (select ci.key from public.membership_cosmetics mc
   join public.cosmetic_items ci on ci.id = mc.item_id
   where mc.membership_id = tests.mid('s4bert')),
  'rank-newcomer', 'F2 ... und es ist der richtige');

select is(
  (select kind from public.membership_cosmetics where membership_id = tests.mid('s4bert')),
  'frame', 'F3 Das gespiegelte kind wurde vom Trigger gesetzt');

select throws_ok(
  $$ insert into public.membership_cosmetics (membership_id, item_id, kind)
     values (tests.mid('s4bert'), gen_random_uuid(), 'frame') $$,
  'P0001',
  'AscendOS: Unbekannter kosmetischer Gegenstand.',
  'F4 Unbekannter kosmetischer Gegenstand wird abgewiesen');


-- ============================================================
-- G. Auszahlungssystem
-- ============================================================

select lives_ok(
  $$ insert into public.ap_ledger (membership_id, delta, reason, source_kind)
     values (tests.mid('s4bert'), 30000, 'Testaufladung', 'manual') $$,
  'G1 Grossbuchung ueber die Team-Leader-Schwelle laeuft durch');

select is(
  (select count(*)::int from public.payouts
   where identity_id='d1000000-0000-0000-0000-00000000000b'),
  1, 'G2 Genau EIN Auszahlungsanspruch entstanden');

select is(
  (select kind from public.payouts where identity_id='d1000000-0000-0000-0000-00000000000b'),
  'team_leader_bonus', 'G3 Anspruch tragt die richtige Art');

select is(
  (select amount_cents from public.payouts where identity_id='d1000000-0000-0000-0000-00000000000b'),
  10000, 'G4 Betrag stammt aus dem Rangkatalog');

select is(
  (select confirmed_paid_at from public.payouts
   where identity_id='d1000000-0000-0000-0000-00000000000b'),
  null, 'G5 KEINE automatische Auszahlung: confirmed_paid_at ist leer');

-- Weitere Buchung darf keinen zweiten Anspruch erzeugen.
select lives_ok(
  $$ insert into public.ap_ledger (membership_id, delta, reason, source_kind)
     values (tests.mid('s4bert'), 500, 'Weitere Buchung', 'manual') $$,
  'G6 Weitere Buchung oberhalb der Schwelle laeuft durch');

select is(
  (select count(*)::int from public.payouts
   where identity_id='d1000000-0000-0000-0000-00000000000b'),
  1, 'G7 ... und erzeugt KEINEN zweiten Anspruch');

select throws_ok(
  $$ insert into public.payouts (identity_id, kind, amount_cents)
     values ('d1000000-0000-0000-0000-00000000000b','team_leader_bonus',10000) $$,
  '23505', null,
  'G8 Zweiter Anspruch derselben Art wird von UNIQUE abgewiesen');

-- Ein Anspruch ANDERER Art bleibt moeglich (kuenftige Belohnungen).
select lives_ok(
  $$ insert into public.payouts (identity_id, kind, amount_cents)
     values ('d1000000-0000-0000-0000-00000000000b','mentor_bonus',20000) $$,
  'G9 Anspruch anderer Art ist erlaubt');


-- ============================================================
-- H. Austritt und Wiedereintritt -- keine zweite Auszahlung
-- ============================================================

-- Bert verlaesst die Organisation und tritt neu ein.
-- Aufbauschritt: status ist von protect_membership_columns geschuetzt.
set local session_replication_role = replica;
update public.memberships set status='ended', left_at=now()
where id = tests.mid('s4bert');
set local session_replication_role = origin;

insert into public.memberships (identity_id, org_id, team_id, role, status)
values ('d1000000-0000-0000-0000-00000000000b','a1000000-0000-0000-0000-000000000001',
        'b1000000-0000-0000-0000-000000000001','berater','active');

select is(
  (select ap_total from public.memberships where id = tests.mid('s4bert')),
  0, 'H1 Neue Mitgliedschaft startet bei 0 AP (Punkte sind org- und mitgliedschaftsbezogen)');

select lives_ok(
  $$ insert into public.ap_ledger (membership_id, delta, reason, source_kind)
     values (tests.mid('s4bert'), 35000, 'Erneut ueber die Schwelle', 'manual') $$,
  'H2 Neue Mitgliedschaft ueberschreitet die Schwelle erneut');

select is(
  (select count(*)::int from public.payouts
   where identity_id='d1000000-0000-0000-0000-00000000000b' and kind='team_leader_bonus'),
  1, 'H3 NACH Wiedereintritt weiterhin nur EIN Anspruch -- die Regel haelt (F2 FD-2)');

select is(
  (select count(*)::int from public.ap_ledger
   where membership_id in (select id from public.memberships
                           where identity_id='d1000000-0000-0000-0000-00000000000b')),
  6, 'H4 Register beider Mitgliedschaften bleibt vollstaendig erhalten');


-- ============================================================
-- I. Mehrere Organisationen
-- ============================================================

-- Bert erhaelt zusaetzlich eine Mitgliedschaft in der FremdOrg.
insert into public.memberships (identity_id, org_id, team_id, role, status)
values ('d1000000-0000-0000-0000-00000000000b','a1000000-0000-0000-0000-000000000002',
        'b1000000-0000-0000-0000-000000000002','berater','active');

select is(
  (select count(*)::int from public.memberships
   where identity_id='d1000000-0000-0000-0000-00000000000b' and status='active'),
  2, 'I1 Bert hat zwei aktive Mitgliedschaften');

select is(
  (select ap_total from public.memberships
   where identity_id='d1000000-0000-0000-0000-00000000000b'
     and org_id='a1000000-0000-0000-0000-000000000002'),
  0, 'I2 Die zweite Organisation startet bei 0 AP -- getrennter Fortschritt');

select is(
  (select ap_total from public.memberships
   where identity_id='d1000000-0000-0000-0000-00000000000b'
     and org_id='a1000000-0000-0000-0000-000000000001' and status='active'),
  35000, 'I3 Die erste Organisation behaelt ihren Stand');

-- Ereignis in der FremdOrg: follow_up hat dort ap = 0.
select lives_ok(
  $$ insert into public.pipeline_events (contact_id, org_id, event_type, source, created_by)
     select tests.make_contact('d1000000-0000-0000-0000-00000000000b',
              'a1000000-0000-0000-0000-000000000002','S4 Fremdkontakt'),
            'a1000000-0000-0000-0000-000000000002','follow_up','manual',
            'd1000000-0000-0000-0000-00000000000b' $$,
  'I4 Ereignis in der Fremdorganisation laeuft durch');

select is(
  (select ap_total from public.memberships
   where identity_id='d1000000-0000-0000-0000-00000000000b'
     and org_id='a1000000-0000-0000-0000-000000000002'),
  0, 'I5 Punkteregeln gelten je Organisation: dort 0 AP fuer follow_up');


-- ============================================================
-- J. Fehlende Mitgliedschaft und Grenzfaelle
-- ============================================================

-- Emil hat eine Mitgliedschaft, aber in der FremdOrg. Ein Ereignis
-- mit fremder org_id findet keine passende Mitgliedschaft.
select lives_ok(
  $$ insert into public.pipeline_events (contact_id, org_id, event_type, source, created_by)
     select c.id, 'a1000000-0000-0000-0000-000000000001', 'follow_up', 'manual',
            'd1000000-0000-0000-0000-00000000000e'
     from public.contacts c where c.name='S4 Fremdkontakt' $$,
  'J1 Ereignis ohne passende Mitgliedschaft laeuft durch, ohne Fehler');

select is(
  (select coalesce(sum(l.delta),0)::int from public.ap_ledger l
   join public.memberships m on m.id = l.membership_id
   where m.identity_id = 'd1000000-0000-0000-0000-00000000000e'),
  0, 'J2 ... und bucht nichts');

-- Ereignis ohne created_by.
select lives_ok(
  $$ insert into public.pipeline_events (contact_id, org_id, event_type, source, created_by)
     select c.id, c.org_id, 'follow_up', 'system', null
     from public.contacts c where c.name='S4 Kontakt Bert' $$,
  'J3 Systemereignis ohne created_by laeuft durch');

select is(
  (select ap_total from public.memberships
   where identity_id='d1000000-0000-0000-0000-00000000000b'
     and org_id='a1000000-0000-0000-0000-000000000001' and status='active'),
  35000, 'J4 ... und bucht nichts (keine Zuordnung moeglich)');

-- Abgelaufene Regel darf nicht greifen.
update public.ap_rules set valid_until = now() - interval '1 day'
where org_id='a1000000-0000-0000-0000-000000000001'
  and source_kind='pipeline_event' and event_type='follow_up';

select lives_ok(
  $$ insert into public.pipeline_events (contact_id, org_id, event_type, source, created_by)
     select c.id, c.org_id, 'follow_up', 'manual', c.owner_id
     from public.contacts c where c.name='S4 Kontakt Bert' $$,
  'J5 Ereignis bei abgelaufener Regel laeuft durch');

select is(
  (select ap_total from public.memberships
   where identity_id='d1000000-0000-0000-0000-00000000000b'
     and org_id='a1000000-0000-0000-0000-000000000001' and status='active'),
  35000, 'J6 ... und bucht nichts: zeitliche Gueltigkeit greift');

-- Regel wieder gueltig, aber inaktiv.
update public.ap_rules set valid_until = null, is_active = false
where org_id='a1000000-0000-0000-0000-000000000001'
  and source_kind='pipeline_event' and event_type='follow_up';

select lives_ok(
  $$ insert into public.pipeline_events (contact_id, org_id, event_type, source, created_by)
     select c.id, c.org_id, 'follow_up', 'manual', c.owner_id
     from public.contacts c where c.name='S4 Kontakt Bert' $$,
  'J7 Ereignis bei inaktiver Regel laeuft durch');

select is(
  (select ap_total from public.memberships
   where identity_id='d1000000-0000-0000-0000-00000000000b'
     and org_id='a1000000-0000-0000-0000-000000000001' and status='active'),
  35000, 'J8 ... und bucht nichts: is_active greift');

update public.ap_rules set is_active = true
where org_id='a1000000-0000-0000-0000-000000000001'
  and source_kind='pipeline_event' and event_type='follow_up';

select throws_ok(
  $$ insert into public.ap_rules (org_id, source_kind, event_type, ap)
     values ('a1000000-0000-0000-0000-000000000001','pipeline_event','follow_up',99) $$,
  '23505', null,
  'J9 Zweite AKTIVE Regel fuer dieselbe Ereignisart wird abgewiesen');

select throws_ok(
  $$ insert into public.ap_rules (org_id, source_kind, event_type, ap)
     values ('a1000000-0000-0000-0000-000000000001','unbekannt','irgendwas',10) $$,
  '23514', null,
  'J10 Unbekannte Herkunftsart wird vom CHECK abgewiesen');


-- ============================================================
-- K. Seasons
-- ============================================================

insert into public.seasons (id, org_id, key, label, starts_at)
values ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',
        's1','Season 1', now() - interval '1 day');

select is(
  (select count(*)::int from public.seasons where org_id='a1000000-0000-0000-0000-000000000001'),
  1, 'K1 Season anlegbar');

-- Eine season-bezogene Regel darf neben der allgemeinen bestehen:
-- das partielle Unique unterscheidet ueber season_id.
select lives_ok(
  $$ insert into public.ap_rules (org_id, source_kind, event_type, ap, season_id)
     values ('a1000000-0000-0000-0000-000000000001','pipeline_event','follow_up',200,
             'c1000000-0000-0000-0000-000000000001') $$,
  'K2 Season-Regel neben der allgemeinen Regel ist erlaubt');

select lives_ok(
  $$ insert into public.cosmetic_items (org_id, kind, key, label, season_id)
     values ('a1000000-0000-0000-0000-000000000001','title','season1-held','Held von Season 1',
             'c1000000-0000-0000-0000-000000000001') $$,
  'K3 Season-Titel anlegbar, ohne Rangbezug');


-- ============================================================
-- L. ap_recalculate
-- ============================================================

-- Puffer absichtlich verfaelschen. Kein session_replication_role
-- noetig: protect_membership_columns schuetzt role, org_id, team_id,
-- sponsor_membership_id, status und identity_id -- ap_total bewusst
-- NICHT, weil es kein Berechtigungsmerkmal ist.
update public.memberships set ap_total = 999999 where id = tests.mid('s4bert');

select tests.authenticate_as('d1000000-0000-0000-0000-00000000000c'); -- Clara, berater
select tests.clear_org();

select throws_like(
  $$ select public.ap_recalculate(tests.mid('s4bert')) $$,
  '%Nur Super-Admins%',
  'L1 Ein Berater darf Punkte nicht neu berechnen');

select tests.authenticate_as('d1000000-0000-0000-0000-00000000000a'); -- Anna, super_admin
select tests.clear_org();

select is(
  public.ap_recalculate(tests.mid('s4bert')),
  35000, 'L2 Super-Admin berechnet neu und erhaelt die Registersumme');

select is(
  (select ap_total from public.memberships where id = tests.mid('s4bert')),
  35000, 'L3 Der verfaelschte Puffer wurde berichtigt');

select throws_like(
  $$ select public.ap_recalculate(
       (select id from public.memberships
        where org_id='a1000000-0000-0000-0000-000000000002' limit 1)) $$,
  '%nicht in dieser Organisation%',
  'L4 Neuberechnung ueber Organisationsgrenzen wird abgewiesen');


-- ============================================================
-- M. Zeilenrechte
-- ============================================================

-- Clara bekommt eine eigene Buchung, damit M3 ein ECHTER Test wird:
-- ohne sie waere "sieht 0 Buchungen" auch dann erfuellt, wenn die
-- Policy gar nicht greift -- sie hat naemlich schlicht keine.
insert into public.ap_ledger (membership_id, delta, reason, source_kind)
values (tests.mid('s4clara'), 100, 'Eigene Buchung fuer den RLS-Test', 'manual');

select tests.authenticate_as('d1000000-0000-0000-0000-00000000000c'); -- Clara
select tests.clear_org();

select isnt(
  (select count(*) from public.ranks), 0::bigint,
  'M1 Berater liest den Rangkatalog');

select isnt(
  (select count(*) from public.ap_rules), 0::bigint,
  'M2 Berater liest die Punkteregeln');

select is(
  (select count(*)::int from public.ap_ledger),
  1, 'M3 Berater sieht GENAU die eigene Buchung, nicht die sechs von Bert');

select isnt(
  (select count(*) from public.membership_cosmetics), 0::bigint,
  'M4 Berater sieht Kosmetik der Organisation (Rahmen sind oeffentlich)');

select is(
  (select count(*)::int from public.payouts),
  0, 'M5 Berater sieht KEINE fremden Auszahlungsansprueche');

select throws_ok(
  $$ insert into public.ap_ledger (membership_id, delta, reason, source_kind)
     values (tests.mid('s4clara'), 9999, 'Selbstgutschrift', 'manual') $$,
  '42501', null,
  'M6 Berater kann sich selbst KEINE Punkte gutschreiben');

select throws_ok(
  $$ insert into public.ranks (org_id, key, label, threshold_ap)
     values ('a1000000-0000-0000-0000-000000000001','schummel','Schummel',1) $$,
  '42501', null,
  'M7 Berater kann keinen Rang anlegen');

select throws_ok(
  $$ update public.ap_rules set ap = 99999
     where org_id='a1000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'M8 Berater kann Punkteregeln nicht aendern');

select tests.authenticate_as('d1000000-0000-0000-0000-00000000000e'); -- Emil, FremdOrg
select tests.clear_org();

select is(
  (select count(*)::int from public.ranks where org_id='a1000000-0000-0000-0000-000000000001'),
  0, 'M9 Fremde Organisation sieht deren Rangkatalog nicht');

select is(
  (select count(*)::int from public.membership_cosmetics mc
   join public.memberships m on m.id = mc.membership_id
   where m.org_id='a1000000-0000-0000-0000-000000000001'),
  0, 'M10 Fremde Organisation sieht deren Kosmetik nicht');

select tests.authenticate_as('d1000000-0000-0000-0000-00000000000b'); -- Bert
select tests.clear_org();

-- KORRIGIERTE ERWARTUNG: Die Policy prueft zuerst
-- `identity_id = auth.uid()`, unabhaengig von current_org_id(). Bert
-- sieht seine eigenen Ansprueche deshalb AUCH bei zwei aktiven
-- Mitgliedschaften -- und das ist richtig, denn der Anspruch gehoert
-- zur Identitaet, nicht zu einer Organisation. Eine erste Fassung
-- dieses Tests erwartete faelschlich 0.
select is(
  (select count(*)::int from public.payouts
   where identity_id='d1000000-0000-0000-0000-00000000000b'),
  2, 'M11 Eigene Ansprueche bleiben sichtbar, auch bei mehrdeutiger Organisation');


-- ============================================================
-- N. Doppelzaehlung derselben Handlung
--
-- Belegt die im Kopf beschriebene Falle: ein Kontakt-Insert erzeugt
-- ein pipeline_event UND ein usage_event, beide 'contact_created'.
-- Sind beide Regeln gesetzt, zaehlt dieselbe Handlung doppelt. Das ist
-- kein Fehler der Migration, sondern eine Konfigurationsentscheidung --
-- hier festgehalten, damit sie bewusst getroffen wird.
-- ============================================================

reset role;

update public.ap_rules set ap = 10
where org_id='a1000000-0000-0000-0000-000000000001'
  and event_type='contact_created' and source_kind='pipeline_event';
update public.ap_rules set ap = 10
where org_id='a1000000-0000-0000-0000-000000000001'
  and event_type='contact_created' and source_kind='usage_event';

select lives_ok(
  $$ select tests.make_contact('d1000000-0000-0000-0000-00000000000c',
       'a1000000-0000-0000-0000-000000000001', 'S4 Doppelzaehl-Kontakt') $$,
  'N1 Kontakt anlegen bei zwei gesetzten Regeln laeuft durch');

select is(
  (select ap_total from public.memberships where id = tests.mid('s4clara')),
  120, 'N2 BELEGT: 100 aus der Vorbuchung + 20 statt 10 -- beide Ereignisstroeme greifen');


-- ============================================================
-- O. Ausfuehrungsrechte
-- ============================================================

select ok(
  not has_function_privilege('anon', 'public.ap_recalculate(uuid)', 'EXECUTE'),
  'O1 anon hat kein EXECUTE auf ap_recalculate');

select ok(
  has_function_privilege('authenticated', 'public.ap_recalculate(uuid)', 'EXECUTE'),
  'O2 authenticated hat EXECUTE auf ap_recalculate');

select ok(
  not has_function_privilege('anon', 'public.rank_for_ap(uuid,integer)', 'EXECUTE'),
  'O3 anon hat kein EXECUTE auf rank_for_ap');

select ok(
  has_table_privilege('authenticated', 'public.ap_ledger', 'SELECT'),
  'O4 authenticated darf das Punkteregister lesen');

select ok(
  not has_table_privilege('authenticated', 'public.ap_ledger', 'INSERT'),
  'O5 authenticated darf NICHT in das Punkteregister schreiben');

select ok(
  not has_table_privilege('anon', 'public.payouts', 'SELECT'),
  'O6 anon darf Auszahlungsansprueche nicht lesen');


-- ============================================================

reset role;
select * from finish();
rollback;
