import { describe, expect, it } from 'vitest';
import de from './catalogs/de.json';
import en from './catalogs/en.json';
import fr from './catalogs/fr.json';
import itCatalog from './catalogs/it.json';
import pl from './catalogs/pl.json';
import tr from './catalogs/tr.json';
import { createCoachTranslator, interpolate } from '.';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  if (value == null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key)
  );
}

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

describe('coach i18n', () => {
  it('keeps full key parity across every coach catalog', () => {
    const expectedMessages = messages(de);
    const expected = Object.keys(expectedMessages).sort();
    for (const catalog of [en, fr, tr, itCatalog, pl]) {
      expect(keys(catalog).sort()).toEqual(expected);
      const localizedMessages = messages(catalog);
      for (const key of expected) {
        expect(placeholders(localizedMessages[key]!)).toEqual(placeholders(expectedMessages[key]!));
      }
    }
  });

  it('interpolates parameters and preserves unknown placeholders', () => {
    expect(interpolate('Hello {name}: {count} / {missing}', { name: 'Tina', count: 3 })).toBe(
      'Hello Tina: 3 / {missing}'
    );
  });

  it('returns localized coach content for every supported locale', () => {
    expect(createCoachTranslator('de')('briefing.greeting', { name: 'Tina' })).toBe(
      'Guten Morgen, Tina.'
    );
    expect(createCoachTranslator('en')('briefing.greeting', { name: 'Tina' })).toBe(
      'Good morning, Tina.'
    );
    expect(createCoachTranslator('fr')('briefing.greeting', { name: 'Tina' })).toBe(
      'Bonjour, Tina.'
    );
    expect(createCoachTranslator('tr')('briefing.greeting', { name: 'Tina' })).toBe(
      'Günaydın, Tina.'
    );
    expect(createCoachTranslator('it')('briefing.greeting', { name: 'Tina' })).toBe(
      'Buongiorno, Tina.'
    );
    expect(createCoachTranslator('pl')('briefing.greeting', { name: 'Tina' })).toBe(
      'Dzień dobry, Tina.'
    );
  });
});
