import { describe, expect, it } from 'vitest';
import { extractWhatsAppDraft } from './extractWhatsAppDraft';

describe('extractWhatsAppDraft', () => {
  it('extracts fenced whatsapp blocks', () => {
    const raw =
      'Hier ein Entwurf:\n\n```whatsapp\nHey Şeyda, kurz check-in — wann passt es?\n```\n\nSoll ich kürzer?';
    const { draft, remainder } = extractWhatsAppDraft(raw);
    expect(draft).toContain('Hey Şeyda');
    expect(remainder).toContain('Soll ich kürzer');
    expect(remainder).not.toContain('```');
  });

  it('falls back to short greeting drafts', () => {
    const raw = 'Hey Şeyda,\n\nwann passt ein kurzer Call heute?';
    const { draft, remainder } = extractWhatsAppDraft(raw);
    expect(draft).toBe(raw);
    expect(remainder).toBe('');
  });

  it('leaves normal analysis replies alone', () => {
    const raw =
      '**Lage**\nŞeyda braucht Fokus auf Onboarding.\n\nNächster Schritt: Follow-up senden.';
    const { draft, remainder } = extractWhatsAppDraft(raw);
    expect(draft).toBeNull();
    expect(remainder).toBe(raw);
  });
});
