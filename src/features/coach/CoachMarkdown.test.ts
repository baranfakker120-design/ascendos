import { describe, expect, it } from 'vitest';
import { promoteCalloutLines, prepareCoachMarkdown } from './CoachMarkdown';

describe('CoachMarkdown preparation', () => {
  it('promotes next-step lines into blockquote callouts', () => {
    const out = promoteCalloutLines('Nächster Schritt: Ruf Mehmet heute an.');
    expect(out).toContain('> **Nächster Schritt:** Ruf Mehmet heute an.');
  });

  it('promotes tip and important lines', () => {
    expect(promoteCalloutLines('Tipp: Kurz und persönlich bleiben.')).toContain('> **Tipp:**');
    expect(promoteCalloutLines('Wichtig: Keine Heilversprechen.')).toContain('> **Wichtig:**');
  });

  it('autolinks bare urls', () => {
    const out = prepareCoachMarkdown('Schau hier: https://duftparty.netlify.app bitte.');
    expect(out).toContain('<https://duftparty.netlify.app>');
  });

  it('does not leave raw emphasis markers when preparing bold callouts', () => {
    const out = promoteCalloutLines('**Nächster Schritt:** Schreib ihm.');
    expect(out).toMatch(/> \*\*Nächster Schritt:\*\* Schreib ihm\./);
  });
});
