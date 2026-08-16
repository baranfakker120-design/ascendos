-- pgTAP: account pending deletion RPCs + visibility
begin;
select plan(8);

create extension if not exists pgtap;

select has_function('public', 'request_account_deletion', array[]::text[]);
select has_function('public', 'cancel_account_deletion', array[]::text[]);
select has_function('public', 'finalize_account_deletion', array['uuid']);
select has_function('public', 'list_due_account_deletions', array['integer']);

-- pgTAP has_column(schema, table, column, description) — 4-arg form required
select has_column('public', 'profiles', 'account_status', 'account_status column');
select has_column(
  'public',
  'profiles',
  'deletion_requested_at',
  'deletion_requested_at column'
);
select has_column(
  'public',
  'profiles',
  'deletion_scheduled_for',
  'deletion_scheduled_for column'
);

select ok(
  exists (
    select 1
    from pg_views
    where schemaname = 'public'
      and viewname = 'profiles_public'
      and definition ilike '%account_status%'
  ),
  'profiles_public filters on account_status'
);

select * from finish();
rollback;
