-- pgTAP: account pending deletion RPCs + visibility
begin;
select plan(8);

-- Ensure helper extensions for tests
create extension if not exists pgtap;

-- Fixture note: uses existing test helpers if present; otherwise lightweight stubs.
-- We only assert function presence and profiles_public filter semantics via SQL.

select has_function('public', 'request_account_deletion', array[]::text[]);
select has_function('public', 'cancel_account_deletion', array[]::text[]);
select has_function('public', 'finalize_account_deletion', array['uuid']);
select has_function('public', 'list_due_account_deletions', array['integer']);

select has_column('public', 'profiles', 'account_status');
select has_column('public', 'profiles', 'deletion_requested_at');
select has_column('public', 'profiles', 'deletion_scheduled_for');

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
