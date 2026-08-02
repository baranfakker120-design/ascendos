-- Migration 21: create_invite must call extensions.gen_random_bytes
begin;
select plan(3);

select ok(
  exists (
    select 1 from pg_extension where extname = 'pgcrypto'
  ),
  'pgcrypto extension is installed'
);

select ok(
  (
    select pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_invite'
    order by p.oid desc
    limit 1
  ) like '%extensions.gen_random_bytes%',
  'create_invite uses extensions.gen_random_bytes'
);

select ok(
  (
    select pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_invite'
    order by p.oid desc
    limit 1
  ) not like '%encode(gen_random_bytes(%',
  'create_invite does not use bare gen_random_bytes'
);

select * from finish();
rollback;
