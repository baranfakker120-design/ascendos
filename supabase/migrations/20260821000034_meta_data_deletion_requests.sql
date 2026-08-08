-- Meta / Instagram Data Deletion Request tracking (Platform Terms).
-- Additive only: no changes to existing Instagram OAuth rows or user data.

create table if not exists public.meta_data_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  confirmation_code text not null,
  meta_user_id text not null,
  status text not null
    check (status in ('completed', 'not_found', 'failed')),
  connections_cleared integer not null default 0
    check (connections_cleared >= 0),
  publish_attempts_cleared integer not null default 0
    check (publish_attempts_cleared >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint meta_data_deletion_requests_code_unique unique (confirmation_code)
);

comment on table public.meta_data_deletion_requests is
  'Audit/status rows for Meta Data Deletion Request callbacks. Written only by the meta-data-deletion Edge Function (service role).';

create index if not exists meta_data_deletion_requests_meta_user_idx
  on public.meta_data_deletion_requests (meta_user_id, created_at desc);

-- Lookup aid for Meta deletion callbacks (ig_user_id = Meta signed_request.user_id).
create index if not exists content_instagram_connections_ig_user_idx
  on public.content_instagram_connections (ig_user_id)
  where ig_user_id is not null;

alter table public.meta_data_deletion_requests enable row level security;

-- No authenticated/anon policies: clients must not read or write this table.
-- Edge Function uses service_role (bypasses RLS).

grant all on table public.meta_data_deletion_requests to service_role;
revoke all on table public.meta_data_deletion_requests from anon, authenticated;
