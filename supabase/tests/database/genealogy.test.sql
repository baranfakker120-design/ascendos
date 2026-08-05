-- ============================================================
-- Sprint 4.1: Genealogy Engine (pgTAP)
-- ============================================================

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

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

grant execute on function tests.authenticate_as(uuid) to authenticated;
grant execute on function tests.clear_org() to authenticated;

set local session_replication_role = replica;
insert into auth.users (id, email) values
  ('e1000000-0000-0000-0000-00000000000a', 'g-anna@test.local'),
  ('e1000000-0000-0000-0000-00000000000b', 'g-bert@test.local'),
  ('e1000000-0000-0000-0000-00000000000c', 'g-clara@test.local'),
  ('e1000000-0000-0000-0000-00000000000e', 'g-emil@test.local');
set local session_replication_role = origin;

insert into public.organizations (id, name) values
  ('ea000000-0000-0000-0000-000000000001', 'Genea Org'),
  ('ea000000-0000-0000-0000-000000000002', 'Fremd Org');

insert into public.teams (id, org_id, name) values
  ('eb000000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000001', 'G Team'),
  ('eb000000-0000-0000-0000-000000000002', 'ea000000-0000-0000-0000-000000000002', 'F Team');

insert into public.profiles (id, org_id, team_id, sponsor_id, role, first_name, last_name, username)
values
  ('e1000000-0000-0000-0000-00000000000a','ea000000-0000-0000-0000-000000000001',
   'eb000000-0000-0000-0000-000000000001', null,'super_admin','GAnna','A','ganna'),
  ('e1000000-0000-0000-0000-00000000000b','ea000000-0000-0000-0000-000000000001',
   'eb000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-00000000000a','berater','GBert','B','gbert'),
  ('e1000000-0000-0000-0000-00000000000c','ea000000-0000-0000-0000-000000000001',
   'eb000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-00000000000b','berater','GClara','C','gclara'),
  ('e1000000-0000-0000-0000-00000000000e','ea000000-0000-0000-0000-000000000002',
   'eb000000-0000-0000-0000-000000000002', null,'berater','GEmil','E','gemil');

set local session_replication_role = replica;
insert into public.memberships (identity_id, org_id, team_id, role, status)
select p.id, p.org_id, p.team_id, p.role, 'active'
from public.profiles p
where p.id::text like 'e1000000%'
  and not exists (select 1 from public.memberships m
                  where m.identity_id=p.id and m.org_id=p.org_id and m.status='active');

update public.memberships m set sponsor_membership_id = sp.id
from public.profiles p
join public.memberships sp on sp.identity_id=p.sponsor_id and sp.org_id=p.org_id and sp.status='active'
where m.identity_id=p.id and m.org_id=p.org_id and m.status='active'
  and p.id::text like 'e1000000%' and p.sponsor_id is not null;
set local session_replication_role = origin;

-- Seed ranks for org so rank_for_ap resolves
insert into public.ranks (org_id, key, label, threshold_ap, frame_asset, sort_order)
select 'ea000000-0000-0000-0000-000000000001', v.key, v.label, v.th, v.frame, v.ord
from (values
  ('newcomer','Newcomer',0,'frame-01',1),
  ('active','Active',250,'frame-02',2)
) as v(key,label,th,frame,ord)
where not exists (
  select 1 from public.ranks r
  where r.org_id='ea000000-0000-0000-0000-000000000001' and r.key=v.key
);

select ok(
  has_function_privilege('authenticated', 'public.get_genealogy_tree(uuid)', 'EXECUTE'),
  'G1 authenticated darf get_genealogy_tree ausführen');

select ok(
  not has_function_privilege('anon', 'public.get_genealogy_tree(uuid)', 'EXECUTE'),
  'G2 anon hat kein EXECUTE auf get_genealogy_tree');

select tests.authenticate_as('e1000000-0000-0000-0000-00000000000a');
select set_config('request.headers',
  json_build_object('x-ascendos-org','ea000000-0000-0000-0000-000000000001')::text, true);

select is(
  (select count(*)::int from public.get_genealogy_tree(null)),
  3, 'G3 Anna sieht sich + Bert + Clara');

select is(
  (select team_count from public.get_genealogy_tree(null)
   where identity_id='e1000000-0000-0000-0000-00000000000a'),
  2, 'G4 Annas team_count ist 2');

select is(
  (select direct_count from public.get_genealogy_tree(null)
   where identity_id='e1000000-0000-0000-0000-00000000000a'),
  1, 'G5 Annas direct_count ist 1 (Bert)');

-- Presence sync
reset role;
insert into public.usage_events (user_id, org_id, event_type, metadata)
values ('e1000000-0000-0000-0000-00000000000b',
        'ea000000-0000-0000-0000-000000000001',
        'app_opened', '{}'::jsonb);

select isnt(
  (select last_app_opened_at from public.memberships
   where identity_id='e1000000-0000-0000-0000-00000000000b'
     and org_id='ea000000-0000-0000-0000-000000000001'),
  null, 'G6 app_opened setzt last_app_opened_at');

-- Sideline: Emil darf Annas Baum nicht sehen
select tests.authenticate_as('e1000000-0000-0000-0000-00000000000e');
select set_config('request.headers',
  json_build_object('x-ascendos-org','ea000000-0000-0000-0000-000000000002')::text, true);

select is(
  (select count(*)::int from public.get_genealogy_tree('e1000000-0000-0000-0000-00000000000a')),
  0, 'G7 FremdOrg sieht Annas Baum nicht');

-- Bert sieht mit null denselben Org-Baum (Anna → Bert → Clara), Root = Anna.
select tests.authenticate_as('e1000000-0000-0000-0000-00000000000b');
select set_config('request.headers',
  json_build_object('x-ascendos-org','ea000000-0000-0000-0000-000000000001')::text, true);

select is(
  (select count(*)::int from public.get_genealogy_tree(null)),
  3, 'G8 Bert sieht Org-Baum inkl. Upline (Anna)');

select is(
  (select identity_id from public.get_genealogy_tree(null) where depth = 0),
  'e1000000-0000-0000-0000-00000000000a'::uuid,
  'G9 Bert: Baum-Root ist Anna, nicht Bert');

-- Explicit Sponsor-Root ohne Ancestor-Recht bleibt gesperrt.
select is(
  (select count(*)::int from public.get_genealogy_tree('e1000000-0000-0000-0000-00000000000a')),
  0, 'G10 Explicit Sponsoren-Wurzel ohne is_ancestor_of bleibt leer');

-- Clara (Leaf) sieht ebenfalls die komplette Hierarchie.
select tests.authenticate_as('e1000000-0000-0000-0000-00000000000c');
select set_config('request.headers',
  json_build_object('x-ascendos-org','ea000000-0000-0000-0000-000000000001')::text, true);

select is(
  (select count(*)::int from public.get_genealogy_tree(null)),
  3, 'G11 Clara sieht Org-Baum inkl. Upline');

select * from finish();
rollback;
