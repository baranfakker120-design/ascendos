import { describe, expect, it } from 'vitest';
import {
  breakWallsOfText,
  matchTeachingLine,
  prepareCoachReading,
  promoteTeachingLines,
  splitLongParagraph,
} from './coachReading';

describe('coachReading', () => {
  it('splits walls of text into scannable paragraphs', () => {
    const wall =
      'Das ist der erste Satz mit genug Länge. Das ist der zweite Satz ebenfalls. ' +
      'Das ist der dritte Satz und er macht den Block länger. Das ist der vierte Satz am Ende.';
    const parts = splitLongParagraph(wall, 120);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length > 0)).toBe(true);
  });

  it('promotes mentor teaching lines into card blockquotes', () => {
    expect(promoteTeachingLines('Pro Tip: Kurz und persönlich bleiben.')).toContain(
      '> **🔥 Profi-Tipp:**'
    );
    expect(promoteTeachingLines('Häufigster Fehler: Zu lange schreiben.')).toContain(
      '> **💡 Häufigster Fehler:**'
    );
    expect(promoteTeachingLines('Warum das zählt: Vertrauen wächst durch Tempo.')).toContain(
      '> **📈 Warum das wichtig ist:**'
    );
    expect(promoteTeachingLines('Nächster Schritt: Ruf Mehmet heute an.')).toContain(
      '> **🎯 Dein nächster Schritt:**'
    );
  });

  it('recognizes emoji-prefixed teaching lines', () => {
    const hit = matchTeachingLine('🔥 Pro Tip: Bleib menschlich.');
    expect(hit?.meta.kind).toBe('tip');
    expect(hit?.body).toContain('Bleib menschlich');
  });

  it.each([
    ['Häufigster Fehler: Zu lange warten.', 'mistake'],
    ['Profi-Tipp: Kurz bleiben.', 'tip'],
    ['Warum das wichtig ist: Tempo schafft Vertrauen.', 'why'],
    ['Dein nächster Schritt: Heute anrufen.', 'action'],
    ['Biggest mistake: Waiting too long.', 'mistake'],
    ['Pro tip: Keep it short.', 'tip'],
    ['Why it matters: Speed builds trust.', 'why'],
    ['Your next step: Call today.', 'action'],
    ['En büyük hata: Çok uzun beklemek.', 'mistake'],
    ['Uzman ipucu: Kısa tut.', 'tip'],
    ['Neden önemli: Hız güven oluşturur.', 'why'],
    ['Bir sonraki adımın: Bugün ara.', 'action'],
    ['La plus grande erreur : Attendre trop longtemps.', 'mistake'],
    ['Conseil de pro : Reste bref.', 'tip'],
    ["Pourquoi c'est important : La rapidité inspire confiance.", 'why'],
    ['Votre prochaine étape : Appelle aujourd’hui.', 'action'],
    ['Errore più grande: Aspettare troppo.', 'mistake'],
    ['Consiglio da professionista: Sii breve.', 'tip'],
    ['Perché è importante: La rapidità crea fiducia.', 'why'],
    ['Il tuo prossimo passo: Chiama oggi.', 'action'],
  ] as const)('recognizes multilingual mentor label "%s"', (line, kind) => {
    expect(matchTeachingLine(line, 'en')?.meta.kind).toBe(kind);
  });

  it('recognizes historical labels but renders chrome in the active locale', () => {
    expect(promoteTeachingLines('Häufigster Fehler: Zu lange warten.', 'fr')).toContain(
      '> **💡 La plus grande erreur:**'
    );
    expect(promoteTeachingLines('Il tuo prossimo passo: Chiama oggi.', 'tr')).toContain(
      '> **🎯 Bir sonraki adımın:**'
    );
    expect(prepareCoachReading('Why it matters: Speed builds trust.', 'it')).toContain(
      '> **📈 Perché è importante:**'
    );
  });

  it('breaks prose blocks but keeps lists intact', () => {
    const src =
      'Erster langer Gedanke. Zweiter langer Gedanke. Dritter langer Gedanke. Vierter langer Gedanke noch dazu.\n\n' +
      '- Punkt A\n- Punkt B';
    const out = breakWallsOfText(src);
    expect(out).toContain('- Punkt A');
    expect(out.split('\n\n').length).toBeGreaterThan(1);
  });

  it('autolinks bare urls in the full pipeline', () => {
    const out = prepareCoachReading('Schau hier: https://duftparty.netlify.app bitte.');
    expect(out).toContain('<https://duftparty.netlify.app>');
  });

  it('does not double-wrap already promoted chrome lines', () => {
    const once = promoteTeachingLines('Tipp: Test');
    const twice = promoteTeachingLines(once);
    expect(twice).toBe(once);
  });
});
