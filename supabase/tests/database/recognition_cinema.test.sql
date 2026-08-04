-- Sprint 6 System 3: recognition cinema (hero_seen)
begin;
select plan(4);

select has_function('public', 'has_seen_advisor_hero', array['date']);
select has_function('public', 'mark_advisor_hero_seen', array['date']);

select ok(
  exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'has_seen_advisor_hero'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  ),
  'authenticated can execute has_seen_advisor_hero'
);

select ok(
  exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'mark_advisor_hero_seen'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  ),
  'authenticated can execute mark_advisor_hero_seen'
);

select * from finish();
rollback;
