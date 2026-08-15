-- ============================================================
-- Knowledge PDF Vision — additive only (repo migration file)
--
-- NEW tables + private storage bucket for Knowledge Center PDFs.
-- Does NOT alter coach_knowledge_* / knowledge_docs / knowledge_chunks
-- columns in a destructive way. Does NOT backfill existing rows.
--
-- Production: NOT applied by agent. No db push / deploy.
-- ============================================================

-- ---------------------------------------------------------------------------
-- Documents (one PDF upload → one draft review unit)
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_pdf_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null
    references public.organizations (id) on delete restrict
    default public.current_org_id(),
  source_filename text not null,
  storage_path text not null,
  title text not null default '',
  status text not null default 'uploading'
    check (status in (
      'uploading',
      'extracting',
      'analyzing',
      'structuring',
      'ready_for_review',
      'approved',
      'vision_failed',
      'failed',
      'archived'
    )),
  page_count int not null default 0,
  text_page_count int not null default 0,
  vision_page_count int not null default 0,
  table_count int not null default 0,
  image_page_count int not null default 0,
  error_message text,
  article_id uuid references public.coach_knowledge_articles (id) on delete set null,
  rag_doc_id uuid references public.knowledge_docs (id) on delete set null,
  coach_rag_enabled boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_pdf_documents_org_path_key unique (org_id, storage_path)
);

create index if not exists knowledge_pdf_documents_org_updated_idx
  on public.knowledge_pdf_documents (org_id, updated_at desc);

alter table public.knowledge_pdf_documents enable row level security;

drop policy if exists knowledge_pdf_documents_select on public.knowledge_pdf_documents;
create policy knowledge_pdf_documents_select
on public.knowledge_pdf_documents for select
to authenticated
using (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
);

drop policy if exists knowledge_pdf_documents_insert on public.knowledge_pdf_documents;
create policy knowledge_pdf_documents_insert
on public.knowledge_pdf_documents for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and public.is_coach_content_manager()
);

drop policy if exists knowledge_pdf_documents_update on public.knowledge_pdf_documents;
create policy knowledge_pdf_documents_update
on public.knowledge_pdf_documents for update
to authenticated
using (
  org_id = public.current_org_id()
  and public.is_coach_content_manager()
)
with check (
  org_id = public.current_org_id()
  and public.is_coach_content_manager()
);

drop policy if exists knowledge_pdf_documents_delete on public.knowledge_pdf_documents;
create policy knowledge_pdf_documents_delete
on public.knowledge_pdf_documents for delete
to authenticated
using (
  org_id = public.current_org_id()
  and public.is_coach_content_manager()
);

revoke all on public.knowledge_pdf_documents from public;
grant select, insert, update, delete on public.knowledge_pdf_documents to authenticated;
grant all on public.knowledge_pdf_documents to service_role;

-- ---------------------------------------------------------------------------
-- Pages (metadata + extraction; no backfill of legacy knowledge)
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_pdf_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null
    references public.organizations (id) on delete restrict
    default public.current_org_id(),
  document_id uuid not null
    references public.knowledge_pdf_documents (id) on delete cascade,
  page_number int not null check (page_number > 0),
  page_type text not null
    check (page_type in ('TEXT', 'SCANNED', 'MIXED', 'IMAGE_HEAVY')),
  section text,
  extracted_text text not null default '',
  visual_summary text,
  table_data jsonb not null default '[]'::jsonb,
  key_facts jsonb not null default '[]'::jsonb,
  important_terms jsonb not null default '[]'::jsonb,
  image_detected boolean not null default false,
  vision_used boolean not null default false,
  vision_confidence text
    check (vision_confidence is null or vision_confidence in ('high', 'medium', 'low', 'needs_review')),
  needs_review boolean not null default false,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_pdf_pages_doc_page_key unique (document_id, page_number)
);

create index if not exists knowledge_pdf_pages_org_doc_idx
  on public.knowledge_pdf_pages (org_id, document_id, page_number);

alter table public.knowledge_pdf_pages enable row level security;

drop policy if exists knowledge_pdf_pages_select on public.knowledge_pdf_pages;
create policy knowledge_pdf_pages_select
on public.knowledge_pdf_pages for select
to authenticated
using (
  org_id = public.current_org_id()
  and public.active_membership_id() is not null
  and exists (
    select 1 from public.knowledge_pdf_documents d
    where d.id = document_id and d.org_id = public.current_org_id()
  )
);

drop policy if exists knowledge_pdf_pages_insert on public.knowledge_pdf_pages;
create policy knowledge_pdf_pages_insert
on public.knowledge_pdf_pages for insert
to authenticated
with check (
  org_id = public.current_org_id()
  and public.is_coach_content_manager()
  and exists (
    select 1 from public.knowledge_pdf_documents d
    where d.id = document_id and d.org_id = public.current_org_id()
  )
);

drop policy if exists knowledge_pdf_pages_update on public.knowledge_pdf_pages;
create policy knowledge_pdf_pages_update
on public.knowledge_pdf_pages for update
to authenticated
using (
  org_id = public.current_org_id()
  and public.is_coach_content_manager()
)
with check (
  org_id = public.current_org_id()
  and public.is_coach_content_manager()
);

drop policy if exists knowledge_pdf_pages_delete on public.knowledge_pdf_pages;
create policy knowledge_pdf_pages_delete
on public.knowledge_pdf_pages for delete
to authenticated
using (
  org_id = public.current_org_id()
  and public.is_coach_content_manager()
);

revoke all on public.knowledge_pdf_pages from public;
grant select, insert, update, delete on public.knowledge_pdf_pages to authenticated;
grant all on public.knowledge_pdf_pages to service_role;

-- ---------------------------------------------------------------------------
-- Private storage bucket — knowledge PDFs only (new uploads)
-- Path convention: {org_id}/knowledge/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'knowledge-pdfs',
  'knowledge-pdfs',
  false,
  52428800,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "knowledge_pdfs_org_select" on storage.objects;
create policy "knowledge_pdfs_org_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'knowledge-pdfs'
  and public.active_membership_id() is not null
  and public.current_org_id() is not null
  and (storage.foldername(name))[1] = public.current_org_id()::text
);

drop policy if exists "knowledge_pdfs_manager_insert" on storage.objects;
create policy "knowledge_pdfs_manager_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'knowledge-pdfs'
  and public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and (storage.foldername(name))[1] = public.current_org_id()::text
  and (storage.foldername(name))[2] = 'knowledge'
);

drop policy if exists "knowledge_pdfs_manager_update" on storage.objects;
create policy "knowledge_pdfs_manager_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'knowledge-pdfs'
  and public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and (storage.foldername(name))[1] = public.current_org_id()::text
)
with check (
  bucket_id = 'knowledge-pdfs'
  and public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and (storage.foldername(name))[1] = public.current_org_id()::text
);

drop policy if exists "knowledge_pdfs_manager_delete" on storage.objects;
create policy "knowledge_pdfs_manager_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'knowledge-pdfs'
  and public.is_coach_content_manager()
  and public.active_membership_id() is not null
  and (storage.foldername(name))[1] = public.current_org_id()::text
);
