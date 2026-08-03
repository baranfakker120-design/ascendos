import type { ContradictionFlag, CoachKnowledgeArticle } from './types';

const CURRENT_YEAR = new Date().getFullYear();
const OUTDATED_YEAR_MIN = CURRENT_YEAR - 6;
const OUTDATED_YEAR_MAX = CURRENT_YEAR - 2;

/** Euro / percent / absolute numbers often used in business rules. */
const NUMBER_RULE =
  /(?:€\s*)?(\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(?:€|EUR|%|Prozent|AP|Punkte)?/gi;

const MISSING_MARKERS = [
  /\bTODO\b/i,
  /\bTBD\b/i,
  /\bFIXME\b/i,
  /\[fehlt\]/i,
  /noch offen/i,
  /platzhalter/i,
];

function normalizeComparable(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): Set<string> {
  return new Set(
    normalizeComparable(text)
      .split(' ')
      .filter((t) => t.length > 3)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function extractRulePairs(markdown: string): Array<{ key: string; value: string; line: string }> {
  const pairs: Array<{ key: string; value: string; line: string }> = [];
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.{3,80}?)\s*[:=]\s*(.+)$/);
    if (m) {
      pairs.push({ key: normalizeComparable(m[1]), value: normalizeComparable(m[2]), line });
      continue;
    }
    const bullet = line.match(/^[-*•]\s*(.{3,60}?)\s+(\d[\d.,]*)\s*(€|%|AP|EUR)?/i);
    if (bullet) {
      pairs.push({
        key: normalizeComparable(bullet[1]),
        value: normalizeComparable(`${bullet[2]}${bullet[3] ?? ''}`),
        line,
      });
    }
  }
  return pairs;
}

export interface ContradictionScanInput {
  title: string;
  bodyMarkdown: string;
  category: string;
  /** Other articles in the same corpus (for duplicate / conflict checks). */
  corpus?: Array<Pick<CoachKnowledgeArticle, 'id' | 'title' | 'body_markdown' | 'category'>>;
  excludeId?: string;
}

/**
 * Client-side Coach contradiction scan (no external AI call).
 * Flags outdated numbers, conflicting rules, duplicates, and missing info.
 */
export function detectKnowledgeContradictions(input: ContradictionScanInput): ContradictionFlag[] {
  const flags: ContradictionFlag[] = [];
  const body = input.bodyMarkdown ?? '';
  const title = input.title?.trim() ?? '';

  if (!title) {
    flags.push({
      kind: 'missing_information',
      severity: 'blocker',
      message: 'Titel fehlt.',
    });
  }

  if (body.trim().length < 40) {
    flags.push({
      kind: 'missing_information',
      severity: 'blocker',
      message: 'Inhalt ist zu kurz — wesentliche Informationen fehlen.',
    });
  }

  for (const re of MISSING_MARKERS) {
    if (re.test(body) || re.test(title)) {
      flags.push({
        kind: 'missing_information',
        severity: 'warning',
        message: 'Platzhalter oder offene Markierungen gefunden.',
        evidence: re.source,
      });
      break;
    }
  }

  const yearMatches = body.match(/\b(19|20)\d{2}\b/g) ?? [];
  for (const y of yearMatches) {
    const year = Number(y);
    if (year >= OUTDATED_YEAR_MIN && year <= OUTDATED_YEAR_MAX) {
      flags.push({
        kind: 'outdated_number',
        severity: 'warning',
        message: `Möglicherweise veraltete Jahreszahl ${year}.`,
        evidence: y,
      });
    }
  }

  // Conflicting rules inside the same article (same key, different values).
  const pairs = extractRulePairs(body);
  const byKey = new Map<string, string[]>();
  for (const p of pairs) {
    const list = byKey.get(p.key) ?? [];
    list.push(p.value);
    byKey.set(p.key, list);
  }
  for (const [key, values] of byKey) {
    const unique = [...new Set(values)];
    if (unique.length > 1) {
      flags.push({
        kind: 'conflicting_rule',
        severity: 'blocker',
        message: `Widersprüchliche Business-Regel zu „${key}“.`,
        evidence: unique.join(' vs '),
      });
    }
  }

  // Numbers mentioned many times with different magnitudes near same keywords.
  const amounts = [...body.matchAll(NUMBER_RULE)].map((m) => m[0].trim());
  if (amounts.length >= 4) {
    const normalized = amounts.map((a) => a.replace(/\s/g, ''));
    const uniq = new Set(normalized);
    if (uniq.size >= 3 && /bonus|provision|preis|ap|rang|ziel/i.test(body)) {
      flags.push({
        kind: 'conflicting_rule',
        severity: 'warning',
        message: 'Mehrere unterschiedliche Kennzahlen im selben Artikel — bitte prüfen.',
        evidence: [...uniq].slice(0, 5).join(', '),
      });
    }
  }

  const corpus = (input.corpus ?? []).filter((a) => a.id !== input.excludeId);
  const selfTokens = tokenize(`${title}\n${body}`);
  for (const other of corpus) {
    const otherTokens = tokenize(`${other.title}\n${other.body_markdown}`);
    const score = jaccard(selfTokens, otherTokens);
    const titleSim = jaccard(tokenize(title), tokenize(other.title));
    if (score >= 0.72 || titleSim >= 0.85) {
      flags.push({
        kind: 'duplicate',
        severity: 'blocker',
        message: `Mögliches Duplikat von „${other.title}“.`,
        evidence: `Ähnlichkeit ${Math.round(score * 100)}%`,
      });
    }

    if (other.category === input.category) {
      const otherPairs = extractRulePairs(other.body_markdown);
      for (const p of pairs) {
        const clash = otherPairs.find((o) => o.key === p.key && o.value !== p.value);
        if (clash) {
          flags.push({
            kind: 'conflicting_rule',
            severity: 'blocker',
            message: `Konflikt mit „${other.title}“ bei „${p.key}“.`,
            evidence: `${p.value} vs ${clash.value}`,
          });
        }
      }
    }
  }

  // Deduplicate by kind+message
  const seen = new Set<string>();
  return flags.filter((f) => {
    const k = `${f.kind}:${f.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function hasBlockingContradictions(flags: ContradictionFlag[]): boolean {
  return flags.some((f) => f.severity === 'blocker');
}

export function summarizeContradictions(flags: ContradictionFlag[]): string | null {
  if (flags.length === 0) return null;
  return flags.map((f) => f.message).join(' · ');
}

/**
 * Activation gate: approved + no blockers. Otherwise Needs Review.
 */
export function resolveArticleStatusAfterScan(
  flags: ContradictionFlag[],
  intended: 'draft' | 'approved'
): 'draft' | 'needs_review' | 'approved' {
  if (intended === 'draft') return 'draft';
  if (hasBlockingContradictions(flags) || flags.some((f) => f.severity === 'warning')) {
    return 'needs_review';
  }
  return 'approved';
}
