-- Phase B: parallel Facebook Login for Business connection (Instagram Music path).
-- Does NOT replace content_instagram_connections (Instagram Login publish path).

create table if not exists public.content_facebook_business_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  fb_user_id text,
  page_id text,
  page_name text,
  -- Instagram Professional account linked via the Facebook Page
  ig_user_id text,
  ig_username text,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'pending_review', 'connected', 'error')),
  scopes text[] not null default '{}'::text[],
  -- Encrypted long-lived Facebook User access token (never plaintext, never to client)
  user_token_ref text,
  -- Encrypted Facebook Page access token for graph.facebook.com Instagram APIs
  page_token_ref text,
  token_expires_at timestamptz,
  last_error text,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_facebook_business_connections_member unique (org_id, membership_id)
);

comment on table public.content_facebook_business_connections is
  'Facebook Login for Business connection for Instagram Music/Audio path. Parallel to Instagram Login connections. Tokens encrypted in *_token_ref only.';

create index if not exists content_facebook_business_connections_ig_user_idx
  on public.content_facebook_business_connections (ig_user_id)
  where ig_user_id is not null;

drop trigger if exists content_facebook_business_connections_set_updated_at
  on public.content_facebook_business_connections;
create trigger content_facebook_business_connections_set_updated_at
  before update on public.content_facebook_business_connections
  for each row execute function public.content_set_updated_at();

alter table public.content_facebook_business_connections enable row level security;

drop policy if exists content_facebook_business_connections_own
  on public.content_facebook_business_connections;
create policy content_facebook_business_connections_own
  on public.content_facebook_business_connections
  for all to authenticated
  using (
    org_id = public.current_org_id()
    and membership_id = public.active_membership_id()
  )
  with check (
    org_id = public.current_org_id()
    and membership_id = public.active_membership_id()
  );
