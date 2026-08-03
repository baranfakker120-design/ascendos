import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CORE_RULES lives in the Edge Function tree (Deno). We assert the
 * mentor contract from the source file so personality regressions fail CI.
 */
describe('Ascent mentor personality contract', () => {
  const rules = readFileSync(
    join(process.cwd(), 'supabase/functions/_shared/prompts.ts'),
    'utf8',
  );

  it('defines Ascent as a mentor, not a chatbot', () => {
    expect(rules).toMatch(/Business-Mentor/);
    expect(rules).toMatch(/kein Chatbot/i);
    expect(rules).toMatch(/kein ChatGPT/i);
  });

  it('locks the calm confident voice', () => {
    expect(rules).toMatch(/Ruhig/);
    expect(rules).toMatch(/Nie arrogant/);
    expect(rules).toMatch(/Nie robotisch/);
    expect(rules).toMatch(/Nie überdreht/);
  });

  it('optimizes for insight → why → action', () => {
    expect(rules).toMatch(/wichtigste Einsicht/);
    expect(rules).toMatch(/Warum das wichtig/);
    expect(rules).toMatch(/nächste konkrete Schritt/);
  });

  it('forbids chatbot closings', () => {
    expect(rules).toMatch(/Anything else\?/);
    expect(rules).toMatch(/Noch Fragen\?/);
    expect(rules).toMatch(/Beende NIEMALS/);
  });

  it('requires conversation continuity', () => {
    expect(rules).toMatch(/Gesprächsverlauf/);
    expect(rules).toMatch(/Starte nie bei null/);
  });
});
