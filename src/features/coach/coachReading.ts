/**
 * Shapes raw Coach replies into a scannable premium reading flow.
 * Pure string transforms — no React. Easy to unit-test.
 */

import type { AppLocale } from '@shared/lib/locale';

const URL_PATTERN = /(https?:\/\/[^\s]+[^\s.,;:!?)\]"'])/g;

/** ~3–5 lines on mobile at coach font size. */
const MAX_PARAGRAPH_CHARS = 220;

export type TeachingKind = 'mistake' | 'tip' | 'action' | 'why' | 'important' | 'quote';

export type TeachingMeta = {
  kind: TeachingKind;
  label: string;
  mark: string;
};

type ChromeKind = Exclude<TeachingKind, 'quote'>;

const CHROME_LABELS: Record<AppLocale, Record<ChromeKind, string>> = {
  de: {
    mistake: 'Häufigster Fehler',
    tip: 'Profi-Tipp',
    action: 'Dein nächster Schritt',
    why: 'Warum das wichtig ist',
    important: 'Wichtig',
  },
  tr: {
    mistake: 'En büyük hata',
    tip: 'Uzman ipucu',
    action: 'Bir sonraki adımın',
    why: 'Neden önemli',
    important: 'Önemli',
  },
  fr: {
    mistake: 'La plus grande erreur',
    tip: 'Conseil de pro',
    action: 'Votre prochaine étape',
    why: "Pourquoi c'est important",
    important: 'Important',
  },
  en: {
    mistake: 'Biggest mistake',
    tip: 'Pro tip',
    action: 'Your next step',
    why: 'Why it matters',
    important: 'Important',
  },
  it: {
    mistake: 'Errore più grande',
    tip: 'Consiglio da professionista',
    action: 'Il tuo prossimo passo',
    why: 'Perché è importante',
    important: 'Importante',
  },
};

const CHROME_MARKS: Record<ChromeKind, string> = {
  mistake: '💡',
  tip: '🔥',
  action: '🎯',
  why: '📈',
  important: '✦',
};

function teachingMeta(kind: ChromeKind, locale: AppLocale): TeachingMeta {
  return { kind, label: CHROME_LABELS[locale][kind], mark: CHROME_MARKS[kind] };
}

const TEACHING_PATTERNS: Array<{
  kind: ChromeKind;
  re: RegExp;
}> = [
  {
    kind: 'mistake',
    re: /^(?:\*\*)?(?:💡\s*)?(?:biggest mistake|h[äa]ufigster fehler|gr[öo](?:ss|ß)ter fehler|fehler(?:\s+den viele machen)?|en b[üu]y[üu]k hata|la plus grande erreur|erreur principale|(?:l['’])?errore pi[ùu] grande|errore principale)(?:\*\*)?\s*[:：—–-]\s*(?:\*\*)?\s*/iu,
  },
  {
    kind: 'tip',
    re: /^(?:\*\*)?(?:🔥\s*)?(?:pro[\s-]?tipp?|profi[\s-]?tipp?|tipp|hinweis|uzman ipucu|profesyonel ipucu|(?:conseil|astuce) de pro|consiglio da professionista|consiglio pro)(?:\*\*)?\s*[:：—–-]\s*(?:\*\*)?\s*/iu,
  },
  {
    kind: 'action',
    re: /^(?:\*\*)?(?:🎯\s*)?(?:your next (?:step|action)|next step|dein(?:e)?\s+n[äa]chster?\s+schritt|n[äa]chster schritt|deine n[äa]chste aktion|n[äa]chste aktion|bir sonraki ad[ıi]m[ıi]n|s[ıi]radaki ad[ıi]m[ıi]n?|sonraki ad[ıi]m[ıi]n?|votre prochaine [ée]tape|ta prochaine [ée]tape|prochaine [ée]tape|il tuo prossimo passo|il prossimo passo|prossimo passo)(?:\*\*)?\s*[:：—–-]\s*(?:\*\*)?\s*/iu,
  },
  {
    kind: 'why',
    re: /^(?:\*\*)?(?:📈\s*)?(?:why (?:it|this) matters|warum das (?:z[äa]hlt|wichtig ist)|warum das hier z[äa]hlt|(?:bu )?neden [öo]nemli|pourquoi (?:c['’]est|cela est) important|pourquoi (?:cela|[çc]a) compte|perch[ée] (?:[èe] importante|conta))(?:\*\*)?\s*[:：—–-]\s*(?:\*\*)?\s*/iu,
  },
  {
    kind: 'important',
    re: /^(?:\*\*)?(?:✦\s*)?(?:wichtig|achtung|merke|important|[öo]nemli|importante)(?:\*\*)?\s*[:：—–-]\s*(?:\*\*)?\s*/iu,
  },
];

export function matchTeachingLine(
  line: string,
  locale: AppLocale = 'de'
): { meta: TeachingMeta; body: string } | null {
  const trimmed = line
    .replace(/^[-*]\s+/, '')
    .replace(/^>\s?/, '')
    .trim();

  for (const p of TEACHING_PATTERNS) {
    if (p.re.test(trimmed)) {
      const body = trimmed
        .replace(p.re, '')
        .replace(/^\*\*|\*\*$/g, '')
        .trim();
      return { meta: teachingMeta(p.kind, locale), body };
    }
  }
  return null;
}

export function detectTeachingFromText(
  text: string,
  locale: AppLocale = 'de'
): TeachingMeta | null {
  return matchTeachingLine(text.trim(), locale)?.meta ?? null;
}

/** Split a long prose block on sentence boundaries. */
export function splitLongParagraph(text: string, maxChars = MAX_PARAGRAPH_CHARS): string[] {
  const t = text.trim();
  if (t.length <= maxChars) return [t];

  const sentences = t.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
  if (!sentences || sentences.length < 2) {
    if (t.length <= maxChars * 1.4) return [t];
    const mid = t.lastIndexOf(' ', Math.floor(t.length / 2));
    if (mid < 40) return [t];
    return [t.slice(0, mid).trim(), t.slice(mid).trim()];
  }

  const chunks: string[] = [];
  let buf = '';
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    const next = buf ? `${buf} ${s}` : s;
    if (next.length > maxChars && buf) {
      chunks.push(buf);
      buf = s;
    } else {
      buf = next;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.length ? chunks : [t];
}

function autolinkPlainUrls(source: string): string {
  return source.replace(URL_PATTERN, (url, _g, offset, full) => {
    const before = full.slice(Math.max(0, offset - 2), offset);
    if (before.endsWith('](') || before.endsWith('(')) return url;
    return `<${url}>`;
  });
}

/**
 * Promote teaching / callout lines into labeled blockquotes the UI paints as cards.
 */
export function promoteTeachingLines(source: string, locale: AppLocale = 'de'): string {
  return source
    .split('\n')
    .map((line) => {
      const hit = matchTeachingLine(line, locale);
      if (!hit) return line;
      const body = hit.body || line.replace(/^>\s?/, '').trim();
      return `> **${hit.meta.mark} ${hit.meta.label}:** ${body}`;
    })
    .join('\n');
}

/**
 * Break wall-of-text paragraphs; leave lists, headings, quotes intact.
 */
export function breakWallsOfText(source: string, locale: AppLocale = 'de'): string {
  const blocks = source.split(/\n{2,}/);
  const out: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const first = trimmed.split('\n')[0] ?? '';
    const isSpecial =
      /^(#{1,6}\s|[-*]\s|\d+\.\s|>)/m.test(trimmed) ||
      trimmed.startsWith('```') ||
      Boolean(matchTeachingLine(first, locale));

    if (isSpecial) {
      out.push(trimmed);
      continue;
    }

    const asOne = trimmed.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ');
    out.push(...splitLongParagraph(asOne));
  }

  return out.join('\n\n');
}

export function ensureSectionBreathing(source: string): string {
  let s = source;
  s = s.replace(/([^\n])\n(> \*\*[💡🔥🎯📈✦])/gu, '$1\n\n$2');
  s = s.replace(/^(#{1,3} .+)\n(?!\n)/gm, '$1\n\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

export function prepareCoachReading(content: string, locale: AppLocale = 'de'): string {
  let s = content.replace(/\r\n/g, '\n').trim();
  s = breakWallsOfText(s, locale);
  s = promoteTeachingLines(s, locale);
  s = ensureSectionBreathing(s);
  s = autolinkPlainUrls(s);
  return s;
}

/** @deprecated */
export function promoteCalloutLines(source: string, locale: AppLocale = 'de'): string {
  return promoteTeachingLines(source, locale);
}

/** @deprecated */
export function prepareCoachMarkdown(content: string, locale: AppLocale = 'de'): string {
  return prepareCoachReading(content, locale);
}
