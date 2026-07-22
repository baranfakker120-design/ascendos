-- ============================================================
-- Migration 10 (ADR-024): LLM-Provider ausschließlich OpenAI.
-- agents.model trug Claude-Modellnamen als DATEN — Default und
-- Bestandszeilen werden umgestellt. (Angewendete Migrationen
-- werden nie editiert, daher Fix-Migration; ADR-018.)
-- ============================================================

alter table public.agents alter column model set default 'gpt-4.1';

update public.agents
set model = 'gpt-4.1'
where lower(model) like 'claude%';
