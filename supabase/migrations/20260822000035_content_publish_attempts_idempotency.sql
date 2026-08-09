-- Phase 5C: at most one in-flight publish attempt per draft (idempotency).
-- Failed/cancelled rows do not block a retry. Published rows are handled in the Edge Function.

create unique index if not exists content_publish_attempts_active_draft_uidx
  on public.content_publish_attempts (draft_id)
  where status in ('queued', 'submitted');

comment on index public.content_publish_attempts_active_draft_uidx is
  'Prevents double-submit Graph publishes for the same draft while queued/submitted.';
