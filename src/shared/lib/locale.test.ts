import { describe, expect, it } from 'vitest';
import { APP_LOCALES, isAppLocale, localeOption } from './locale';

describe('locale helpers', () => {
  it('lists the six supported languages', () => {
    expect(APP_LOCALES.map((l) => l.code)).toEqual(['de', 'en', 'tr', 'it', 'es', 'pl']);
  });

  it('validates locale codes', () => {
    expect(isAppLocale('de')).toBe(true);
    expect(isAppLocale('xx')).toBe(false);
  });

  it('resolves German as the default option', () => {
    expect(localeOption('de').flag).toContain('lang-de');
  });
});
