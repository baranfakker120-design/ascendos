-- ============================================================
-- Glossily readiness foundation (additive, no production Org B)
--
-- 1) knowledge_pdf_documents: content hash + fast-scan fields
-- 2) ai_usage_events: minimal org-scoped token/cost ledger
--
-- Does NOT create Glossily. Does NOT change Radar/Meta/Autopilot.
-- Does NOT drop or rewrite existing Org #1 data.
-- ============================================================

-- ---------------------------------------------------------------------------
-- PDF Fast Scan — exact duplicate detection (org-scoped)
-- ---------------------------------------------------------------------------
alter table public.knowledge_pdf_documents
  add column if not exists content_sha256 text,
  add column if not exists byte_size bigint,
  add column if not exists fast_scan_result text
    check (
      fast_scan_result is null
      or fast_scan_result in (
        'new',
        'exact_duplicate',
        'possible_version',
        'conflict_review'
      )
    ),
  add column if not exists duplicate_of_id uuid
    references public.knowledge_pdf_documents (id) on delete set null;

comment on column public.knowledge_pdf_documents.content_sha256 is
  'SHA-256 hex of PDF bytes; org-scoped exact-duplicate fast scan.';
comment on column public.knowledge_pdf_documents.fast_scan_result is
  'Fast-scan outcome before deep vision analysis.';

create unique index if not exists knowledge_pdf_documents_org_sha_uidx
  on public.knowledge_pdf_documents (org_id, content_sha256)
  where content_sha256 is not null
    and status not in ('failed', 'archived', 'uploading');

create index if not exists knowledge_pdf_documents_org_filename_idx
  on public.knowledge_pdf_documents (org_id, lower(source_filename));

-- ---------------------------------------------------------------------------
-- AI usage ledger (minimal) — tokens per org/feature/provider
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null
    references public.organizations (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  feature text not null,
  provider text,
  model text,
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  estimated_cost_micros bigint check (
    estimated_cost_micros is null or estimated_cost_micros >= 0
  ),
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_org_created_idx
  on public.ai_usage_events (org_id, created_at desc);

create index if not exists ai_usage_events_org_feature_idx
  on public.ai_usage_events (org_id, feature, created_at desc);

alter table public.ai_usage_events enable row level security;

drop policy if exists ai_usage_events_select_org_admin on public.ai_usage_events;
create policy ai_usage_events_select_org_admin
on public.ai_usage_events for select
to authenticated
using (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
  and (
    user_id = auth.uid()
    or public.is_organization_admin()
    or public.is_platform_super_admin()
  )
);

-- Inserts are server/edge (service role) or authenticated same-org own row.
drop policy if exists ai_usage_events_insert_own on public.ai_usage_events;
create policy ai_usage_events_insert_own
on public.ai_usage_events for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
  and (user_id is null or user_id = auth.uid())
);

revoke all on public.ai_usage_events from public;
grant select, insert on public.ai_usage_events to authenticated;
grant all on public.ai_usage_events to service_role;

comment on table public.ai_usage_events is
  'Minimal org-scoped AI token ledger. Estimated cost optional (micros).';
