import { describe, expect, it } from 'vitest';
import { prepareCoachReading, promoteCalloutLines } from './coachReading';

describe('CoachMarkdown preparation exports', () => {
  it('promotes next-step lines into blockquote callouts', () => {
    const out = promoteCalloutLines('Nächster Schritt: Ruf Mehmet heute an.');
    expect(out).toContain('> **🎯 Dein nächster Schritt:** Ruf Mehmet heute an.');
  });

  it('promotes tip and important lines', () => {
    expect(promoteCalloutLines('Tipp: Kurz und persönlich bleiben.')).toContain(
      '> **🔥 Profi-Tipp:**'
    );
    expect(promoteCalloutLines('Wichtig: Keine Heilversprechen.')).toContain('> **✦ Wichtig:**');
  });

  it('uses active-locale chrome for historical mentor labels', () => {
    expect(promoteCalloutLines('Pro Tip: Keep it concise.', 'fr')).toContain(
      '> **🔥 Conseil de pro:**'
    );
    expect(promoteCalloutLines('Neden önemli: Güven oluşturur.', 'en')).toContain(
      '> **📈 Why it matters:**'
    );
  });

  it('autolinks bare urls', () => {
    const out = prepareCoachReading('Schau hier: https://duftparty.netlify.app bitte.');
    expect(out).toContain('<https://duftparty.netlify.app>');
  });

  it('normalizes bold-wrapped callout labels', () => {
    const out = promoteCalloutLines('**Nächster Schritt:** Schreib ihm.');
    expect(out).toContain('> **🎯 Dein nächster Schritt:** Schreib ihm.');
  });
});
