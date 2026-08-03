import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { readStoredLocale, writeStoredLocale, type AppLocale } from '@shared/lib/locale';
import {
  createTranslator,
  type MessageKey,
  type TranslateFn,
  type TranslateParams,
} from './translate';

export interface LocaleContextValue {
  locale: AppLocale;
  setLocale: (code: AppLocale) => void;
  t: TranslateFn;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function applyDocumentLang(code: AppLocale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = code;
}

/**
 * Centralized translation provider.
 * Locale changes re-render consumers only — no remount, no navigation, no flash.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(() => readStoredLocale());

  useEffect(() => {
    applyDocumentLang(locale);
  }, [locale]);

  const setLocale = useCallback((code: AppLocale) => {
    writeStoredLocale(code);
    applyDocumentLang(code);
    setLocaleState(code);
  }, []);

  const t = useMemo(() => createTranslator(locale), [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useI18n must be used within LocaleProvider');
  }
  return ctx;
}

/** Optional hook for shared UI that may render outside the provider in tests. */
export function useOptionalI18n(): LocaleContextValue | null {
  return useContext(LocaleContext);
}

export function useT(): TranslateFn {
  return useI18n().t;
}

export type { MessageKey, TranslateFn, TranslateParams };
