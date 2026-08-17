-- Autopilot publishing modes smoke test (schema only)

begin;
select plan(3);

select has_column(
  'public',
  'content_autopilot_settings',
  'publishing_mode',
  'publishing_mode column exists'
);

select col_default_is(
  'public',
  'content_autopilot_settings',
  'publishing_mode',
  '''full''::text',
  'publishing_mode defaults to full for backward compatibility'
);

select col_default_is(
  'public',
  'content_autopilot_settings',
  'max_stories_per_day',
  '4',
  'new rows default max_stories_per_day=4 without rewriting existing values'
);

select * from finish();
rollback;
