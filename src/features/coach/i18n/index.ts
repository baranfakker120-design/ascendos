import de from './catalogs/de.json';
import en from './catalogs/en.json';
import fr from './catalogs/fr.json';
import it from './catalogs/it.json';
import pl from './catalogs/pl.json';
import tr from './catalogs/tr.json';
import type { AppLocale } from '@shared/lib/locale';

export type CoachParams = Record<string, string | number>;
export type CoachTranslateFn = (key: string, params?: CoachParams) => string;

type CoachCatalog = typeof de;

const CATALOGS: Record<AppLocale, CoachCatalog> = {
  de,
  en: en as CoachCatalog,
  fr: fr as CoachCatalog,
  tr: tr as CoachCatalog,
  it: it as CoachCatalog,
  pl: pl as CoachCatalog,
};

function lookup(catalog: CoachCatalog, key: string): string | undefined {
  let current: unknown = catalog;
  for (const segment of key.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current : undefined;
}

export function interpolate(template: string, params?: CoachParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] === undefined ? `{${name}}` : String(params[name])
  );
}

/** Create a translator for coach-authored content, with German as the safe fallback. */
export function createCoachTranslator(locale: AppLocale): CoachTranslateFn {
  const catalog = CATALOGS[locale] ?? CATALOGS.de;
  return (key, params) => {
    const template = lookup(catalog, key) ?? lookup(CATALOGS.de, key) ?? key;
    return interpolate(template, params);
  };
}
