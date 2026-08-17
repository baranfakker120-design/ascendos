-- Phase 13 Glossily readiness — schema smoke (no Org B creation)

begin;
select plan(6);

select has_table('public', 'ai_usage_events', 'ai_usage_events exists');
select has_column('public', 'knowledge_pdf_documents', 'content_sha256', 'pdf content hash column');
select has_column('public', 'knowledge_pdf_documents', 'fast_scan_result', 'pdf fast_scan_result column');
select has_column('public', 'ai_usage_events', 'org_id', 'ai_usage_events.org_id');
select has_column('public', 'ai_usage_events', 'input_tokens', 'ai_usage_events.input_tokens');
select has_column('public', 'ai_usage_events', 'output_tokens', 'ai_usage_events.output_tokens');

select * from finish();
rollback;
