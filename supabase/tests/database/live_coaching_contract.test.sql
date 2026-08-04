-- Sprint 6 System 4: live coaching contract RPCs
begin;
select plan(5);

select has_function('public', 'maintain_live_coaching_events', array['uuid']);
select has_function('public', 'run_live_coaching_maintenance_job');
select has_function('public', 'claim_due_coaching_notifications', array['integer']);
select has_function('public', 'live_coaching_next_starts_at', array['timestamptz', 'text']);
select has_column(
  'public',
  'live_coaching_events',
  'org_id',
  'live_coaching_events.org_id exists'
);

select * from finish();
rollback;
