import { describe, expect, it } from 'vitest';
import { APP_LOCALES } from '@shared/lib/locale';
import de from './catalogs/de.json';
import en from './catalogs/en.json';
import fr from './catalogs/fr.json';
import itCatalog from './catalogs/it.json';
import pl from './catalogs/pl.json';
import tr from './catalogs/tr.json';
import { createTranslator } from './translate';

function messages(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (value == null || typeof value !== 'object') return {};
  return Object.entries(value).reduce<Record<string, string>>(
    (all, [key, child]) => ({
      ...all,
      ...messages(child, prefix ? `${prefix}.${key}` : key),
    }),
    {}
  );
}

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();
}

describe('shared i18n catalogs', () => {
  it('keeps full key and placeholder parity across every locale including Polish', () => {
    const expectedMessages = messages(en);
    const expected = Object.keys(expectedMessages).sort();
    for (const catalog of [de, fr, tr, itCatalog, pl]) {
      const localizedMessages = messages(catalog);
      expect(Object.keys(localizedMessages).sort()).toEqual(expected);
      for (const key of expected) {
        expect(placeholders(localizedMessages[key]!)).toEqual(placeholders(expectedMessages[key]!));
      }
    }
  });

  it('registers every APP_LOCALES code in catalogs', () => {
    expect(APP_LOCALES.map((l) => l.code).sort()).toEqual(
      ['de', 'en', 'fr', 'it', 'pl', 'tr'].sort()
    );
  });

  it('translates core UI in Polish without English fallback', () => {
    const t = createTranslator('pl');
    expect(t('nav.today')).toBe('Dzisiaj');
    expect(t('nav.team')).toBe('Zespół');
    expect(t('locale.name.pl')).toBe('Polski');
    expect(t('common.retry')).not.toMatch(/retry|try again/i);
  });
});
