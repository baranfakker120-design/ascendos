-- Migration 25: Fall 4 rejects ambiguity (no mirror guess).
begin;
select plan(5);

select ok(
  (
    select pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_super_admin'
    order by p.oid desc
    limit 1
  ) like '%memberships%',
  'is_super_admin reads memberships'
);

select ok(
  (
    select pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'current_user_role'
    order by p.oid desc
    limit 1
  ) like '%memberships%',
  'current_user_role reads memberships'
);

select ok(
  (
    select pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'active_membership_id'
    order by p.oid desc
    limit 1
  ) like '%x-ascendos-org%',
  'active_membership_id honors x-ascendos-org'
);

select ok(
  (
    select pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'active_membership_id'
    order by p.oid desc
    limit 1
  ) not like '%v_mirror%',
  'active_membership_id does not fall back to profiles.org_id mirror'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'organizations'
      and policyname = 'organizations_select_own_memberships'
  ),
  'organizations_select_own_memberships policy present'
);

select * from finish();
rollback;
