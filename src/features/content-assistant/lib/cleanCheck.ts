import { looksLikeInternalId, textContainsInternalId } from './contentGenerate/safeCopy';

/**
 * Deterministic Clean Check heuristics for Content Assistant drafts.
 * Supportive signal only — never claims Instagram compliance or shadowban safety.
 */

export type CleanCheckStatus = 'clean' | 'attention';

export interface CleanCheckInput {
  hook?: string | null;
  caption?: string | null;
  cta?: string | null;
  keywords?: string[] | null;
  hashtags?: string[] | null;
}

export interface CleanCheckResult {
  status: CleanCheckStatus;
  notes: string[];
  /** Explicit product disclaimer — always false for guarantees. */
  isGuarantee: false;
}

export const CLEAN_CHECK_DISCLAIMER =
  'Clean Check is a technical precaution only — not a guarantee of Instagram compliance or protection from reach loss.';

const SPAM_HASHTAGS = new Set([
  'fyp',
  'foryou',
  'foryoupage',
  'viral',
  'viralvideo',
  'explorepage',
  'explore',
  'trending',
  'follow4follow',
  'like4like',
  'l4l',
  'f4f',
  'spam',
  'instagood',
  'instalike',
  'followme',
]);

const ENGAGEMENT_BAIT =
  /\b(like\s*and\s*share|like\s*for\s*like|comment\s*yes|tag\s*(3|three)\s*friends|double\s*tap|link\s*in\s*bio\s*now|smash\s*that|follow\s*for\s*follow)\b/i;

const MISLEADING_CLAIMS =
  /\b(guaranteed\s*income|passive\s*income\s*guaranteed|get\s*rich|make\s*\$?\d+|earn\s*\$?\d+k?|miracle\s*cure|cures?\s+\w+|100\s*%\s*safe\s*from\s*shadowban|shadowban[\s-]*proof|instagram\s*guaranteed|financial\s*freedom\s*guaranteed)\b/i;

const RISKY_TERMS =
  /\b(shadowban\s*hack|algorithm\s*hack|bot\s*growth|buy\s*followers|fake\s*engagement)\b/i;

const AGGRESSIVE_CAPS_RATIO = 0.45;

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase();
}

function textBlob(input: CleanCheckInput): string {
  return [
    input.hook,
    input.caption,
    input.cta,
    ...(input.keywords ?? []),
    ...(input.hashtags ?? []),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Detect caption keyword stuffing: many keywords repeated verbatim. */
function detectKeywordStuffing(caption: string, keywords: string[]): boolean {
  if (!caption || keywords.length < 3) return false;
  const lower = caption.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    const k = kw.trim().toLowerCase();
    if (k.length < 3) continue;
    if (lower.includes(k)) hits += 1;
  }
  return hits >= Math.min(keywords.length, 5) && hits / Math.max(keywords.length, 1) >= 0.7;
}

export function runCleanCheck(input: CleanCheckInput): CleanCheckResult {
  const notes: string[] = [];
  const hashtags = (input.hashtags ?? []).map(normalizeTag).filter(Boolean);
  const keywords = (input.keywords ?? []).map((k) => k.trim()).filter(Boolean);
  const caption = (input.caption ?? '').trim();
  const blob = textBlob(input);

  if (hashtags.length > 18) {
    notes.push('Too many hashtags (keep a focused set).');
  }

  const unique = new Set(hashtags);
  if (hashtags.length > 0 && unique.size < hashtags.length) {
    notes.push('Repeated hashtags detected.');
  }

  const spamTags = hashtags.filter((h) => SPAM_HASHTAGS.has(h));
  if (spamTags.length > 0) {
    notes.push(`Generic/spam-leaning hashtags: ${spamTags.map((h) => `#${h}`).join(', ')}`);
  }

  if (ENGAGEMENT_BAIT.test(blob)) {
    notes.push('Aggressive engagement-bait phrasing detected.');
  }

  if (MISLEADING_CLAIMS.test(blob)) {
    notes.push('Potentially misleading or absolute claim language detected.');
  }

  if (RISKY_TERMS.test(blob)) {
    notes.push('Potentially risky growth/manipulation language detected.');
  }

  if (
    looksLikeInternalId(input.hook) ||
    looksLikeInternalId(input.caption) ||
    looksLikeInternalId(input.cta) ||
    textContainsInternalId(blob)
  ) {
    notes.push('Internal id / UUID must not appear in public copy.');
  }

  const letters = caption.replace(/[^A-Za-zÄÖÜäöüß]/g, '');
  if (letters.length >= 24) {
    const caps = letters.replace(/[^A-ZÄÖÜ]/g, '').length;
    if (caps / letters.length >= AGGRESSIVE_CAPS_RATIO) {
      notes.push('Caption uses excessive capitalization.');
    }
  }

  if ((caption.match(/!/g) ?? []).length >= 4) {
    notes.push('Caption uses many exclamation marks.');
  }

  if (/\b(clickbait|shocking|you won'?t believe)\b/i.test(blob)) {
    notes.push('Sensational/clickbait phrasing detected.');
  }

  if (detectKeywordStuffing(caption, keywords)) {
    notes.push('Caption looks keyword-stuffed.');
  }

  notes.push(CLEAN_CHECK_DISCLAIMER);

  return {
    status: notes.length > 1 ? 'attention' : 'clean',
    notes,
    isGuarantee: false,
  };
}

export function formatCleanCheckNotes(result: CleanCheckResult): string {
  return result.notes.join(' · ');
}
