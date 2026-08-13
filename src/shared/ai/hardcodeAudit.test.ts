import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 6 hard-code audit for AI context surfaces.
 * Brand/UI hardcoding remains Phase 8; this only guards AI prompt leaks.
 */
describe('Phase 6 — Team Seyda / Chogan AI context audit', () => {
  const prompts = readFileSync(
    join(process.cwd(), 'supabase/functions/_shared/prompts.ts'),
    'utf8'
  );
  const intents = readFileSync(
    join(process.cwd(), 'supabase/functions/_shared/intent-router/intents.ts'),
    'utf8'
  );
  const coreRulesMatch = prompts.match(/export const CORE_RULES = `([\s\S]*?)`;/);
  const coreRules = coreRulesMatch?.[1] ?? '';

  it('CORE_RULES no longer injects Chogan / Team Seyda into every org prompt', () => {
    expect(coreRules).not.toMatch(/Chogan/i);
    expect(coreRules).not.toMatch(/Team Seyda/i);
    expect(coreRules).not.toMatch(/Essence Tribe/i);
    expect(coreRules).not.toMatch(/WayToMoon/i);
  });

  it('intent rewrite queries do not hardcode Chogan into embeddings', () => {
    expect(intents).not.toMatch(/Chogan Parfum/);
    expect(intents).toMatch(/Parfum Duftnummer/);
  });

  it('keeps waytomoon_sent domain key; Phase 8 neutralized visible WayToMoon labels', () => {
    const coachChat = readFileSync(
      join(process.cwd(), 'supabase/functions/coach-chat/index.ts'),
      'utf8'
    );
    expect(coachChat).toMatch(/waytomoon_sent/);
    expect(coachChat).not.toMatch(/WayToMoon (gesendet|sent)/);
  });
});
