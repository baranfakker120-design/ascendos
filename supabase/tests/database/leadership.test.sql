-- ============================================================
-- Sprint 4.2: Leader Experience (pgTAP)
-- TeamLeader qualification, AP tasks anti-cheat, leader RPCs
-- ============================================================

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

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

grant execute on function tests.authenticate_as(uuid) to authenticated;

set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('f1000000-0000-0000-0000-00000000000a', 'l-anna@test.local'),
  ('f1000000-0000-0000-0000-00000000000b', 'l-b1@test.local'),
  ('f1000000-0000-0000-0000-00000000000c', 'l-b2@test.local'),
  ('f1000000-0000-0000-0000-00000000000d', 'l-b3@test.local'),
  ('f1000000-0000-0000-0000-00000000000e', 'l-b4@test.local'),
  ('f1000000-0000-0000-0000-00000000000f', 'l-b5@test.local');
set local session_replication_role = origin;

insert into public.organizations (id, name)
values ('fa000000-0000-0000-0000-000000000001', 'Leader Org')
on conflict do nothing;

insert into public.teams (id, org_id, name)
values ('fb000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000001', 'L Team')
on conflict do nothing;

insert into public.profiles (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('f1000000-0000-0000-0000-00000000000a','fa000000-0000-0000-0000-000000000001',
   'fb000000-0000-0000-0000-000000000001', null,'super_admin','LAnna','A','lanna'),
  ('f1000000-0000-0000-0000-00000000000b','fa000000-0000-0000-0000-000000000001',
   'fb000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-00000000000a','berater','LB1','B','lb1'),
  ('f1000000-0000-0000-0000-00000000000c','fa000000-0000-0000-0000-000000000001',
   'fb000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-00000000000a','berater','LB2','B','lb2'),
  ('f1000000-0000-0000-0000-00000000000d','fa000000-0000-0000-0000-000000000001',
   'fb000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-00000000000a','berater','LB3','B','lb3'),
  ('f1000000-0000-0000-0000-00000000000e','fa000000-0000-0000-0000-000000000001',
   'fb000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-00000000000a','berater','LB4','B','lb4'),
  ('f1000000-0000-0000-0000-00000000000f','fa000000-0000-0000-0000-000000000001',
   'fb000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-00000000000a','berater','LB5','B','lb5');

set local session_replication_role = replica;
insert into public.memberships (identity_id, org_id, team_id, role, status, last_app_opened_at)
select p.id, p.org_id, p.team_id, p.role, 'active', now()
from public.profiles p
where p.id::text like 'f1000000%'
  and not exists (select 1 from public.memberships m
                  where m.identity_id=p.id and m.org_id=p.org_id and m.status='active');

update public.memberships m set sponsor_membership_id = sp.id
from public.profiles p
join public.memberships sp on sp.identity_id=p.sponsor_id and sp.org_id=p.org_id and sp.status='active'
where m.identity_id=p.id and m.org_id=p.org_id and m.status='active'
  and p.id::text like 'f1000000%' and p.sponsor_id is not null;
set local session_replication_role = origin;

insert into public.ranks (org_id, key, label, threshold_ap, frame_asset, payout_cents, payout_kind, sort_order)
select 'fa000000-0000-0000-0000-000000000001', v.key, v.label, v.th, v.frame, v.pay, v.pk, v.ord
from (values
  ('newcomer','Newcomer',0,'frame-01', null::int, null::text, 1),
  ('team_leader','Team Leader',30000,'frame-06',10000,'team_leader_bonus',6)
) as v(key,label,th,frame,pay,pk,ord)
where not exists (
  select 1 from public.ranks r
  where r.org_id='fa000000-0000-0000-0000-000000000001' and r.key=v.key
);

insert into public.ap_task_defs (org_id, key, title, description, category, difficulty, ap, repeatable, cooldown_hours, sort_order)
select 'fa000000-0000-0000-0000-000000000001', v.key, v.title, v.description, v.category, v.difficulty, v.ap, v.repeatable, v.cooldown, v.sort
from (values
  ('prospect_messaged', 'Interessent angeschrieben', 'msg', 'outreach', 'easy', 5, true, 4, 10),
  ('rank_reached', 'Neuer Rang erreicht', 'rank', 'rank', 'epic', 250, false, null::int, 80)
) as v(key, title, description, category, difficulty, ap, repeatable, cooldown, sort)
on conflict (org_id, key) do nothing;

create or replace function tests.lmid(uname text)
returns uuid language sql stable as $$
  select m.id from public.memberships m
  join public.profiles p on p.id = m.identity_id
  where p.username = uname and m.status='active' limit 1;
$$;

select ok(
  has_function_privilege('authenticated', 'public.get_leader_dashboard()', 'EXECUTE'),
  'L1 authenticated darf get_leader_dashboard');

select ok(
  has_function_privilege('authenticated', 'public.complete_ap_task(text, text)', 'EXECUTE'),
  'L2 authenticated darf complete_ap_task');

select tests.authenticate_as('f1000000-0000-0000-0000-00000000000a');
select set_config('request.headers',
  json_build_object('x-ascendos-org','fa000000-0000-0000-0000-000000000001')::text, true);

-- Force re-eval after inserts (trigger may have run under replica)
select public.evaluate_team_leader_qualification(tests.lmid('lanna'));

select is(
  public.count_active_firstlines(tests.lmid('lanna')),
  5, 'L3 Anna hat 5 aktive Firstlines');

select ok(
  (select team_leader_qualified_at is not null from public.memberships where id = tests.lmid('lanna')),
  'L4 TeamLeader Qualifikation gesetzt');

select is(
  (select count(*)::int from public.payouts
   where identity_id='f1000000-0000-0000-0000-00000000000a' and kind='team_leader_bonus'),
  1, 'L5 Genau ein 100€ Bonus-Anspruch');

-- Second eval must not duplicate payout
select public.evaluate_team_leader_qualification(tests.lmid('lanna'));
select is(
  (select count(*)::int from public.payouts
   where identity_id='f1000000-0000-0000-0000-00000000000a' and kind='team_leader_bonus'),
  1, 'L6 Keine Doppelauszahlung');

-- AP task completion awards once
select lives_ok(
  $$ select * from public.complete_ap_task('prospect_messaged', null) $$,
  'L7 Aufgabe abschließen vergibt AP');

select is(
  (select ap_total from public.memberships where id = tests.lmid('lanna')) >= 5,
  true, 'L8 AP-Konto erhöht');

select throws_ok(
  $$ select * from public.complete_ap_task('prospect_messaged', null) $$,
  'P0001',
  'AscendOS: Aufgabe noch in Abkühlzeit.',
  'L9 Cooldown verhindert Doppel-AP');

select lives_ok(
  $$ select * from public.complete_ap_task('rank_reached', null) $$,
  'L10 Einmalige Aufgabe rank_reached');

select throws_ok(
  $$ select * from public.complete_ap_task('rank_reached', null) $$,
  'P0001',
  'AscendOS: Aufgabe bereits abgeschlossen.',
  'L11 Einmalige Aufgabe nur einmal');

select ok(
  (select jsonb_typeof(public.get_leader_dashboard()) = 'object'),
  'L12 Leader Dashboard liefert Objekt');

select ok(
  (select jsonb_typeof(public.get_team_insights()) = 'array'),
  'L13 Team Insights liefert Array');

select ok(
  (select active_firstlines from public.get_team_leader_progress(null)) = 5,
  'L14 TeamLeader Progress zeigt 5 Firstlines');

select * from finish();
rollback;
