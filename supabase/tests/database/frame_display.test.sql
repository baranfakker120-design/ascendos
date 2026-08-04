-- Sprint 6 System 1: display_rank + cosmetics RPCs exist
begin;
select plan(3);

select has_function(
  'public',
  'display_rank_for_ap',
  array['uuid', 'integer', 'boolean'],
  'display_rank_for_ap(org, ap, tl_qualified) exists'
);

select has_function(
  'public',
  'equip_frame_cosmetic',
  array['uuid'],
  'equip_frame_cosmetic(item_id) exists'
);

select ok(
  exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'list_my_frame_cosmetics'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  ),
  'authenticated can execute list_my_frame_cosmetics'
);

select * from finish();
rollback;
