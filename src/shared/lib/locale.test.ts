import { describe, expect, it } from 'vitest';
import { APP_LOCALES, isAppLocale, localeOption } from './locale';

describe('locale helpers', () => {
  it('lists every supported language including Polish', () => {
    expect(APP_LOCALES.map((l) => l.code)).toEqual(['de', 'tr', 'fr', 'en', 'it', 'pl']);
  });

  it('validates locale codes', () => {
    expect(isAppLocale('de')).toBe(true);
    expect(isAppLocale('fr')).toBe(true);
    expect(isAppLocale('pl')).toBe(true);
    expect(isAppLocale('xx')).toBe(false);
    expect(isAppLocale('es')).toBe(false);
  });

  it('resolves German as the default option', () => {
    expect(localeOption('de').flag).toContain('lang-de');
  });
});
