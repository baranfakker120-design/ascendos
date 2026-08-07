import { describe, expect, it } from 'vitest';
import { createCoachTranslator } from '../i18n';
import { buildContactCoachSuggestions } from './contactSuggestions';

describe('buildContactCoachSuggestions', () => {
  it('builds contact-scoped chips and never org-wide prompts', () => {
    const coachT = createCoachTranslator('de');
    const chips = buildContactCoachSuggestions(coachT, 'Erol Yılmaz');
    expect(chips.length).toBeGreaterThanOrEqual(6);
    expect(chips.some((c) => /Erol/i.test(c.label))).toBe(true);
    const blob = chips.map((c) => `${c.label} ${c.prompt}`).join('\n');
    expect(blob).not.toMatch(/Welche Linie/i);
    expect(blob).not.toMatch(/Wer braucht Coaching/i);
    expect(blob).not.toMatch(/höchste Priorität/i);
    expect(blob).not.toMatch(/Zuhal aktivieren/i);
    expect(blob).toMatch(/WhatsApp/i);
    expect(blob).toMatch(/Zoom/i);
    expect(blob).toMatch(/Einwand/i);
  });

  it('localizes contact chips for English', () => {
    const chips = buildContactCoachSuggestions(createCoachTranslator('en'), 'Erol');
    expect(chips[0]?.label).toMatch(/WhatsApp for Erol/i);
    expect(chips.some((c) => /already know about Erol/i.test(c.label))).toBe(true);
  });
});
