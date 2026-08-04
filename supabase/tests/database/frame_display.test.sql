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

select has_function_privilege(
  'authenticated',
  'public.list_my_frame_cosmetics()',
  'EXECUTE'
);

select * from finish();
rollback;
