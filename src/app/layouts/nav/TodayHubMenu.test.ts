import { describe, expect, it } from 'vitest';
import { createTranslator, type MessageKey } from '@shared/i18n/translate';
import { APP_LOCALES } from '@shared/lib/locale';

const HUB_KEYS: MessageKey[] = [
  'todayHub.title',
  'todayHub.subtitle',
  'todayHub.close',
  'todayHub.menuAria',
  'todayHub.plan',
  'todayHub.planSub',
  'todayHub.priorities',
  'todayHub.prioritiesSub',
  'todayHub.content',
  'todayHub.contentSub',
  'todayHub.tasks',
  'todayHub.tasksSub',
  'todayHub.stats',
  'todayHub.statsSub',
  'todayHub.contentPageBody',
  'todayHub.backToToday',
];

describe('Today hub i18n', () => {
  it('resolves hub labels in every supported language', () => {
    for (const locale of APP_LOCALES) {
      const t = createTranslator(locale.code);
      for (const key of HUB_KEYS) {
        const label = t(key);
        expect(label.length).toBeGreaterThan(0);
        expect(label).not.toBe(key);
      }
    }
  });

  it('keeps the requested German and Turkish positioning copy', () => {
    const de = createTranslator('de');
    const tr = createTranslator('tr');
    expect(de('todayHub.title')).toBe('Heute');
    expect(de('todayHub.content')).toBe('AI Content Assistent');
    expect(tr('todayHub.title')).toBe('Bugün');
    expect(tr('todayHub.content')).toBe('AI İçerik Asistanı');
  });
});
