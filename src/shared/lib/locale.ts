/** UI-Sprachen für AscendOS — Präsentation; Persistenz lokal. */

export type AppLocale = 'de' | 'en' | 'tr' | 'it' | 'es' | 'pl';

export interface LocaleOption {
  code: AppLocale;
  label: string;
  flag: string;
}

export const APP_LOCALES: readonly LocaleOption[] = [
  { code: 'de', label: 'German', flag: '/brand/nav/lang-de.svg' },
  { code: 'en', label: 'English', flag: '/brand/nav/lang-en.svg' },
  { code: 'tr', label: 'Türkçe', flag: '/brand/nav/lang-tr.svg' },
  { code: 'it', label: 'Italiano', flag: '/brand/nav/lang-it.svg' },
  { code: 'es', label: 'Español', flag: '/brand/nav/lang-es.svg' },
  { code: 'pl', label: 'Polski', flag: '/brand/nav/lang-pl.svg' },
] as const;

const STORAGE_KEY = 'ascendos.locale';

export function isAppLocale(value: string): value is AppLocale {
  return APP_LOCALES.some((l) => l.code === value);
}

export function readStoredLocale(): AppLocale {
  if (typeof window === 'undefined') return 'de';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && isAppLocale(raw)) return raw;
  } catch {
    // private mode
  }
  return 'de';
}

export function writeStoredLocale(code: AppLocale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // ignore
  }
}

export function localeOption(code: AppLocale): LocaleOption {
  return APP_LOCALES.find((l) => l.code === code) ?? APP_LOCALES[0];
}
