import { describe, expect, it } from 'vitest';
import { welcomeIdentityLine, welcomeNextStepBody } from './CoachWelcomeContent';

describe('CoachWelcomeContent', () => {
  const welcome =
    'Ich bin Ascent — dein Mentor für den Alltag im Business.\n\nKein Theorie-Marathon. Eine klare Einsicht, warum sie zählt, und was du als Nächstes tust.\n\nNächster Schritt: Sag mir, woran du gerade arbeitest — Einwand, Nachricht oder nächster Move mit einem Kontakt.';

  it('extracts a short identity line from the welcome wall of text', () => {
    expect(welcomeIdentityLine(welcome)).toBe('Ich bin Ascent.');
  });

  it('extracts the next-step body without the long theory paragraphs', () => {
    expect(welcomeNextStepBody(welcome)).toMatch(/Sag mir, woran du gerade arbeitest/i);
    expect(welcomeNextStepBody(welcome)).not.toMatch(/Theorie-Marathon/i);
  });
});
