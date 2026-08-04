import { describe, expect, it } from 'vitest';
import de from './catalogs/de.json';
import en from './catalogs/en.json';
import fr from './catalogs/fr.json';
import it from './catalogs/it.json';
import tr from './catalogs/tr.json';
import { createCoachTranslator, interpolate } from '.';

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  if (value == null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key)
  );
}

describe('coach i18n', () => {
  it('keeps full key parity across every coach catalog', () => {
    const expected = keys(de).sort();
    for (const catalog of [en, fr, tr, it]) {
      expect(keys(catalog).sort()).toEqual(expected);
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
  });
});
