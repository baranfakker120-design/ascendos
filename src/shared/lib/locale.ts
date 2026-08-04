/** UI languages for AscendOS — presentation only; persisted locally. */

export type AppLocale = 'de' | 'tr' | 'fr' | 'en' | 'it';

export interface LocaleOption {
  code: AppLocale;
  /** Native endonym — never mixed with another language. */
  labelKey: `locale.name.${AppLocale}`;
  flag: string;
}

export const APP_LOCALES: readonly LocaleOption[] = [
  { code: 'de', labelKey: 'locale.name.de', flag: '/brand/nav/lang-de.svg' },
  { code: 'tr', labelKey: 'locale.name.tr', flag: '/brand/nav/lang-tr.svg' },
  { code: 'fr', labelKey: 'locale.name.fr', flag: '/brand/nav/lang-fr.svg' },
  { code: 'en', labelKey: 'locale.name.en', flag: '/brand/nav/lang-en.svg' },
  { code: 'it', labelKey: 'locale.name.it', flag: '/brand/nav/lang-it.svg' },
] as const;

const STORAGE_KEY = 'ascendos.locale';

/** Legacy codes removed from the product — map to a supported locale. */
const LEGACY_LOCALE_MAP: Record<string, AppLocale> = {
  es: 'en',
  pl: 'en',
};

export function isAppLocale(value: string): value is AppLocale {
  return APP_LOCALES.some((l) => l.code === value);
}

export function readStoredLocale(): AppLocale {
  if (typeof window === 'undefined') return 'de';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return 'de';
    if (isAppLocale(raw)) return raw;
    const mapped = LEGACY_LOCALE_MAP[raw];
    if (mapped) {
      try {
        window.localStorage.setItem(STORAGE_KEY, mapped);
      } catch {
        // private mode
      }
      return mapped;
    }
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
