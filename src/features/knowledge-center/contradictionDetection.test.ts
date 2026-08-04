import { describe, expect, it } from 'vitest';
import {
  detectKnowledgeContradictions,
  hasBlockingContradictions,
  resolveArticleStatusAfterScan,
} from './contradictionDetection';

describe('detectKnowledgeContradictions', () => {
  it('flags missing content and placeholders', () => {
    const flags = detectKnowledgeContradictions({
      title: '',
      bodyMarkdown: 'TODO',
      category: 'Allgemein',
    });
    expect(flags.some((f) => f.kind === 'missing_information')).toBe(true);
    expect(hasBlockingContradictions(flags)).toBe(true);
  });

  it('flags conflicting business rules in one article', () => {
    const flags = detectKnowledgeContradictions({
      title: 'Bonus Regeln',
      bodyMarkdown: [
        'TeamLeader Bonus Regeln im Überblick.',
        '',
        'TeamLeader Bonus: 100 €',
        'TeamLeader Bonus: 50 €',
      ].join('\n'),
      category: 'Business Rules',
    });
    expect(flags.some((f) => f.kind === 'conflicting_rule')).toBe(true);
  });

  it('flags duplicates against corpus', () => {
    const body =
      'Die Onboarding Reise erklärt den ersten Monat mit Fokus auf Kontakte und Präsentation.';
    const flags = detectKnowledgeContradictions({
      title: 'Onboarding Reise',
      bodyMarkdown: body,
      category: 'Onboarding',
      corpus: [
        {
          id: 'other',
          title: 'Onboarding Reise',
          body_markdown: body,
          category: 'Onboarding',
        },
      ],
    });
    expect(flags.some((f) => f.kind === 'duplicate')).toBe(true);
  });

  it('requires Needs Review before activation when blockers exist', () => {
    const flags = detectKnowledgeContradictions({
      title: 'Kurz',
      bodyMarkdown: 'zu kurz',
      category: 'Allgemein',
    });
    expect(resolveArticleStatusAfterScan(flags, 'approved')).toBe('needs_review');
  });

  it('allows approved when clean', () => {
    const flags = detectKnowledgeContradictions({
      title: 'Produktleitfaden Duftparty',
      bodyMarkdown:
        'Die Duftparty dauert 90 Minuten. Der Gastgeber erhält Proben und eine klare Follow-up Checkliste nach dem Termin.',
      category: 'Produkte',
    });
    expect(resolveArticleStatusAfterScan(flags, 'approved')).toBe('approved');
  });
});
