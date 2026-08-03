/**
 * Shapes raw Coach replies into a scannable premium reading flow.
 * Pure string transforms — no React. Easy to unit-test.
 */

const URL_PATTERN = /(https?:\/\/[^\s]+[^\s.,;:!?)\]"'])/g;

/** ~3–5 lines on mobile at coach font size. */
const MAX_PARAGRAPH_CHARS = 220;

export type TeachingKind = 'mistake' | 'tip' | 'action' | 'why' | 'important' | 'quote';

export type TeachingMeta = {
  kind: TeachingKind;
  label: string;
  mark: string;
};

const CHROME: TeachingMeta[] = [
  { kind: 'mistake', label: 'Häufigster Fehler', mark: '💡' },
  { kind: 'tip', label: 'Pro Tip', mark: '🔥' },
  { kind: 'action', label: 'Dein nächster Schritt', mark: '🎯' },
  { kind: 'why', label: 'Warum das zählt', mark: '📈' },
  { kind: 'important', label: 'Wichtig', mark: '✦' },
];

const TEACHING_PATTERNS: Array<{
  meta: TeachingMeta;
  re: RegExp;
}> = [
  {
    meta: CHROME[0],
    re: /^(?:💡\s*)?(?:\*\*)?(?:biggest mistake|h[äa]ufigster fehler|gr[öo](?:ss|ß)ter fehler|fehler(?:\s+den viele machen)?)(?:\*\*)?\s*[:—–-]\s*/i,
  },
  {
    meta: CHROME[1],
    re: /^(?:🔥\s*)?(?:\*\*)?(?:pro[\s-]?tipp?|tipp|hinweis)(?:\*\*)?\s*[:—–-]\s*/i,
  },
  {
    meta: CHROME[2],
    re: /^(?:🎯\s*)?(?:\*\*)?(?:your next action|dein(?:e)?\s+n[äa]chster?\s+schritt|n[äa]chster schritt|deine n[äa]chste aktion|n[äa]chste aktion)(?:\*\*)?\s*[:—–-]\s*/i,
  },
  {
    meta: CHROME[3],
    re: /^(?:📈\s*)?(?:\*\*)?(?:why this matters|warum das (?:z[äa]hlt|wichtig ist)|warum das hier z[äa]hlt)(?:\*\*)?\s*[:—–-]\s*/i,
  },
  {
    meta: CHROME[4],
    re: /^(?:✦\s*)?(?:\*\*)?(?:wichtig|achtung|merke)(?:\*\*)?\s*[:—–-]\s*/i,
  },
];

const CHROME_LINE_RE =
  /^(?:\*\*)?[💡🔥🎯📈✦]\s+(Häufigster Fehler|Pro Tip|Dein nächster Schritt|Warum das zählt|Wichtig)(?:\*\*)?\s*[:—–-]\s*(?:\*\*)?(.*?)(?:\*\*)?\s*$/iu;

function metaFromChromeLabel(label: string): TeachingMeta | null {
  return CHROME.find((c) => c.label.toLowerCase() === label.toLowerCase()) ?? null;
}

export function matchTeachingLine(line: string): { meta: TeachingMeta; body: string } | null {
  const trimmed = line
    .replace(/^[-*]\s+/, '')
    .replace(/^>\s?/, '')
    .trim();

  const chrome = trimmed.match(CHROME_LINE_RE);
  if (chrome) {
    const meta = metaFromChromeLabel(chrome[1]);
    if (meta) return { meta, body: (chrome[2] ?? '').trim() };
  }

  for (const p of TEACHING_PATTERNS) {
    if (p.re.test(trimmed)) {
      const body = trimmed
        .replace(p.re, '')
        .replace(/^\*\*|\*\*$/g, '')
        .trim();
      return { meta: p.meta, body };
    }
  }
  return null;
}

export function detectTeachingFromText(text: string): TeachingMeta | null {
  return matchTeachingLine(text.trim())?.meta ?? null;
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
export function promoteTeachingLines(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      const hit = matchTeachingLine(line);
      if (!hit) return line;
      const body = hit.body || line.replace(/^>\s?/, '').trim();
      return `> **${hit.meta.mark} ${hit.meta.label}:** ${body}`;
    })
    .join('\n');
}

/**
 * Break wall-of-text paragraphs; leave lists, headings, quotes intact.
 */
export function breakWallsOfText(source: string): string {
  const blocks = source.split(/\n{2,}/);
  const out: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const first = trimmed.split('\n')[0] ?? '';
    const isSpecial =
      /^(#{1,6}\s|[-*]\s|\d+\.\s|>)/m.test(trimmed) ||
      trimmed.startsWith('```') ||
      Boolean(matchTeachingLine(first));

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

export function prepareCoachReading(content: string): string {
  let s = content.replace(/\r\n/g, '\n').trim();
  s = breakWallsOfText(s);
  s = promoteTeachingLines(s);
  s = ensureSectionBreathing(s);
  s = autolinkPlainUrls(s);
  return s;
}

/** @deprecated */
export function promoteCalloutLines(source: string): string {
  return promoteTeachingLines(source);
}

/** @deprecated */
export function prepareCoachMarkdown(content: string): string {
  return prepareCoachReading(content);
}
