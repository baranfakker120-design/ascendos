-- Sprint 6 System 3: recognition cinema (hero_seen)
begin;
select plan(4);

select has_function('public', 'has_seen_advisor_hero', array['date']);
select has_function('public', 'mark_advisor_hero_seen', array['date']);
select has_function_privilege(
  'authenticated',
  'public.has_seen_advisor_hero(date)',
  'EXECUTE'
);
select has_function_privilege(
  'authenticated',
  'public.mark_advisor_hero_seen(date)',
  'EXECUTE'
);

select * from finish();
rollback;
