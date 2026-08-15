-- pgTAP: Knowledge PDF Vision additive tables + RLS (repo only).
-- Not run against production by agents. Requires local supabase test db.

begin;
select plan(8);

select has_table('public', 'knowledge_pdf_documents', 'knowledge_pdf_documents exists');
select has_table('public', 'knowledge_pdf_pages', 'knowledge_pdf_pages exists');

select ok(
  exists (
    select 1 from storage.buckets where id = 'knowledge-pdfs' and public = false
  ),
  'knowledge-pdfs bucket is private'
);

select ok(
  (
    select relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'knowledge_pdf_documents'
  ),
  'knowledge_pdf_documents RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'knowledge_pdf_pages'
  ),
  'knowledge_pdf_pages RLS enabled'
);

-- Existing CMS / RAG tables must still exist (no destructive replace).
select has_table('public', 'coach_knowledge_articles', 'CMS articles preserved');
select has_table('public', 'knowledge_docs', 'RAG docs preserved');
select has_table('public', 'knowledge_chunks', 'RAG chunks preserved');

select * from finish();
rollback;
