/**
 * Shapes raw Coach replies into a scannable premium reading flow.
 * Pure string transforms — no React. Easy to unit-test.
 */

import type { AppLocale } from '@shared/lib/locale';
import { createCoachTranslator, type CoachTranslateFn } from './i18n';

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
type TeachingLocalization = AppLocale | CoachTranslateFn;

const CHROME_MARKS: Record<ChromeKind, string> = {
  mistake: '💡',
  tip: '🔥',
  action: '🎯',
  why: '📈',
  important: '✦',
};

function resolveTranslator(localization: TeachingLocalization): CoachTranslateFn {
  return typeof localization === 'function' ? localization : createCoachTranslator(localization);
}

function teachingMeta(kind: ChromeKind, t: CoachTranslateFn): TeachingMeta {
  return { kind, label: t(`reading.${kind}`), mark: CHROME_MARKS[kind] };
}

const TEACHING_PATTERNS: Array<{
  kind: ChromeKind;
  re: RegExp;
}> = [
  {
    kind: 'mistake',
    re: /^(?:\*\*)?(?:💡\s*)?(?:biggest mistake|most common mistake|h[äa]ufigster fehler|gr[öo](?:ss|ß)ter fehler|fehler(?:\s+den viele machen)?|en b[üu]y[üu]k hata|en s[ıi]k yap[ıi]lan hata|la plus grande erreur|erreur la plus fr[ée]quente|erreur courante|erreur principale|(?:l['’])?errore pi[ùu] grande|errore pi[ùu] frequente|errore pi[ùu] comune|errore principale)(?:\*\*)?\s*[:：—–-]\s*(?:\*\*)?\s*/iu,
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
  localization: TeachingLocalization = 'de'
): { meta: TeachingMeta; body: string } | null {
  const t = resolveTranslator(localization);
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
      return { meta: teachingMeta(p.kind, t), body };
    }
  }
  return null;
}

export function detectTeachingFromText(
  text: string,
  localization: TeachingLocalization = 'de'
): TeachingMeta | null {
  return matchTeachingLine(text.trim(), localization)?.meta ?? null;
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
export function promoteTeachingLines(
  source: string,
  localization: TeachingLocalization = 'de'
): string {
  return source
    .split('\n')
    .map((line) => {
      const hit = matchTeachingLine(line, localization);
      if (!hit) return line;
      const body = hit.body || line.replace(/^>\s?/, '').trim();
      return `> **${hit.meta.mark} ${hit.meta.label}:** ${body}`;
    })
    .join('\n');
}

/**
 * Break wall-of-text paragraphs; leave lists, headings, quotes intact.
 */
export function breakWallsOfText(
  source: string,
  localization: TeachingLocalization = 'de'
): string {
  const blocks = source.split(/\n{2,}/);
  const out: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const first = trimmed.split('\n')[0] ?? '';
    const isSpecial =
      /^(#{1,6}\s|[-*]\s|\d+\.\s|>)/m.test(trimmed) ||
      trimmed.startsWith('```') ||
      Boolean(matchTeachingLine(first, localization));

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

export function prepareCoachReading(
  content: string,
  localization: TeachingLocalization = 'de'
): string {
  let s = content.replace(/\r\n/g, '\n').trim();
  s = breakWallsOfText(s, localization);
  s = promoteTeachingLines(s, localization);
  s = ensureSectionBreathing(s);
  s = autolinkPlainUrls(s);
  return s;
}

/** @deprecated */
export function promoteCalloutLines(
  source: string,
  localization: TeachingLocalization = 'de'
): string {
  return promoteTeachingLines(source, localization);
}

/** @deprecated */
export function prepareCoachMarkdown(
  content: string,
  localization: TeachingLocalization = 'de'
): string {
  return prepareCoachReading(content, localization);
}
