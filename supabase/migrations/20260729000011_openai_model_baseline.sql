-- ============================================================
-- Migration 11 (ADR-025): Modell-Baseline auf die aktuelle
-- OpenAI-Generation heben.
--
-- Warum eine eigene Migration statt Edit von Migration 10:
-- angewendete Migrationen werden nie verändert (ADR-018).
--
-- `agents.model` bleibt DATEN. Diese Migration setzt nur die
-- Ausgangswerte; einzelne Agenten dürfen abweichend konfiguriert
-- werden, und `resolveModel()` in _shared/llm.ts fängt Alt-Werte
-- (Claude-Namen) zur Laufzeit defensiv ab.
--
-- Rollback: Default zurück auf 'gpt-4.1' setzen und die Zeilen
-- entsprechend updaten — es gibt keine Schemaänderung.
-- ============================================================

alter table public.agents alter column model set default 'gpt-5.6';

-- 1) Alt-Daten aus der Anthropic-Zeit nach Leistungsklasse mappen.
--    Diese Werte würden sonst einen 400er der OpenAI-API auslösen.
update public.agents
set model = case
  when lower(model) like '%haiku%' then 'gpt-5.6-luna'
  else 'gpt-5.6'
end
where lower(model) like '%claude%'
   or lower(model) like '%anthropic%';

-- 2) Legacy-Generation auf die aktuelle Generation heben. Bewusst nur
--    exakte Treffer — individuell gepflegte Sondermodelle einzelner
--    Orgs bleiben unangetastet.
update public.agents
set model = 'gpt-5.6'
where model in ('gpt-4.1', 'gpt-4-turbo', 'gpt-4o');

update public.agents
set model = 'gpt-5.6-luna'
where model in ('gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o-mini');

-- 3) Sicherheitsnetz: leere Modelle sind ein Deployment-Fehler, der sich
--    sonst erst zur Laufzeit als 400er zeigt.
update public.agents
set model = 'gpt-5.6'
where model is null or btrim(model) = '';
