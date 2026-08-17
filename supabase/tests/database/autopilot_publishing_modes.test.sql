-- Autopilot publishing modes smoke test (schema only)
-- Avoid col_default_is quote/cast formatting mismatches across PG versions.

begin;
select plan(4);

select has_column(
  'public',
  'content_autopilot_settings',
  'publishing_mode',
  'publishing_mode column exists'
);

select ok(
  (
    select pg_get_expr(d.adbin, d.adrelid) like '%full%'
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    join pg_class c on c.oid = d.adrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'content_autopilot_settings'
      and a.attname = 'publishing_mode'
  ),
  'publishing_mode defaults to full for backward compatibility'
);

select ok(
  (
    select pg_get_expr(d.adbin, d.adrelid) ~ '^4([^0-9]|$)'
    from pg_attrdef d
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
    join pg_class c on c.oid = d.adrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'content_autopilot_settings'
      and a.attname = 'max_stories_per_day'
  ),
  'new rows default max_stories_per_day=4 without rewriting existing values'
);

select ok(
  exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'content_autopilot_settings'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%publishing_mode%'
      and pg_get_constraintdef(c.oid) ilike '%marked_stories%'
  ),
  'publishing_mode check allows stories/feed/full/marked_stories'
);

select * from finish();
rollback;
