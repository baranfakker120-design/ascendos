import de from './catalogs/de.json';
import en from './catalogs/en.json';
import fr from './catalogs/fr.json';
import it from './catalogs/it.json';
import tr from './catalogs/tr.json';
import type { AppLocale } from '@shared/lib/locale';

type MessageTree = typeof en;

export type MessageKey = FlattenKeys<MessageTree>;

type FlattenKeys<T, P extends string = ''> = T extends string
  ? P
  : {
      [K in keyof T & string]: FlattenKeys<T[K], P extends '' ? K : `${P}.${K}`>;
    }[keyof T & string];

export type TranslateParams = Record<string, string | number>;

export type TranslateFn = (key: MessageKey, params?: TranslateParams) => string;

const CATALOGS: Record<AppLocale, MessageTree> = {
  de: de as MessageTree,
  en,
  fr: fr as MessageTree,
  tr: tr as MessageTree,
  it: it as MessageTree,
};

function lookup(tree: MessageTree, key: string): string | undefined {
  const parts = key.split('.');
  let cur: unknown = tree;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] === undefined || params[name] === null ? `{${name}}` : String(params[name])
  );
}

/** Create a translator bound to one locale (React or non-React). */
export function createTranslator(locale: AppLocale): TranslateFn {
  const catalog = CATALOGS[locale] ?? CATALOGS.de;
  const fallback = CATALOGS.de;
  return (key, params) => {
    const raw = lookup(catalog, key) ?? lookup(fallback, key) ?? key;
    return interpolate(raw, params);
  };
}

export function catalogFor(locale: AppLocale): MessageTree {
  return CATALOGS[locale] ?? CATALOGS.de;
}
