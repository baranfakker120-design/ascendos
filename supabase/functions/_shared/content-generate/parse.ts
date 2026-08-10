import {
  REQUIRED_HASHTAG_COUNT,
  type ContentFormat,
  type GenerationPayload,
  type HashtagDetail,
  type KeywordDetail,
  type SlideAnalysis,
} from './types.ts';

export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('invalid_ai_json');
  return JSON.parse(raw.slice(start, end + 1));
}

export function asStringArray(v: unknown, max = 24): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const s = item.trim();
    if (!s) continue;
    out.push(s.replace(/^#/, ''));
    if (out.length >= max) break;
  }
  return out;
}

export function asNullableString(v: unknown, max = 2000): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, max);
}

export function normalizeFormat(v: unknown, fallback: ContentFormat): ContentFormat {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (s === 'story' || s === 'feed' || s === 'reel') return s;
  return fallback;
}

function parseKeywordDetails(v: unknown, fallbackKeywords: string[]): KeywordDetail[] {
  const out: KeywordDetail[] = [];
  if (Array.isArray(v)) {
    for (const item of v) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const keyword = asNullableString(o.keyword ?? o.term ?? o.text, 120);
      const why = asNullableString(o.why ?? o.reason ?? o.begründung ?? o.begruendung, 400);
      if (!keyword || !why) continue;
      out.push({ keyword, why });
      if (out.length >= 12) break;
    }
  }
  if (out.length > 0) return out;
  return fallbackKeywords.slice(0, 8).map((keyword) => ({
    keyword,
    why: 'Abgeleitet aus Themen- und Zielgruppenkontext des Contents.',
  }));
}

function parseHashtagDetails(v: unknown, tags: string[]): HashtagDetail[] {
  const map = new Map<string, string>();
  if (Array.isArray(v)) {
    for (const item of v) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const tag = asNullableString(o.tag ?? o.hashtag ?? o.text, 80)?.replace(/^#/, '');
      const why = asNullableString(o.why ?? o.reason ?? o.begründung ?? o.begruendung, 400);
      if (!tag || !why) continue;
      map.set(tag.toLowerCase(), why);
    }
  }
  return tags.map((tag) => ({
    tag,
    why:
      map.get(tag.toLowerCase()) ??
      'Strategische Einschätzung auf Basis von Thema, Zielgruppe und Nischenrelevanz.',
  }));
}

function parseSlides(v: unknown, slideCount: number): SlideAnalysis[] {
  const out: SlideAnalysis[] = [];
  if (Array.isArray(v)) {
    for (const item of v) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const indexRaw = Number(o.index ?? o.slide ?? out.length + 1);
      const index = Number.isFinite(indexRaw) ? Math.floor(indexRaw) : out.length + 1;
      const summary = asNullableString(o.summary ?? o.what ?? o.text, 600) ?? '';
      const role = asNullableString(o.role ?? o.purpose, 200) ?? '';
      if (!summary && !role) continue;
      out.push({
        index,
        summary,
        role,
        issue: asNullableString(o.issue ?? o.problem, 400),
        fix: asNullableString(o.fix ?? o.improvement, 400),
      });
    }
  }
  if (slideCount <= 1) return out;
  // Ensure one entry per slide index when possible.
  const byIndex = new Map(out.map((s) => [s.index, s]));
  const filled: SlideAnalysis[] = [];
  for (let i = 1; i <= slideCount; i++) {
    filled.push(
      byIndex.get(i) ?? {
        index: i,
        summary: `Slide ${i}`,
        role: i === 1 ? 'hook' : i === slideCount ? 'close' : 'support',
        issue: null,
        fix: null,
      }
    );
  }
  return filled;
}

function normalizeHookStrength(v: unknown): 'strong' | 'ok' | 'weak' | null {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (s === 'strong' || s === 'ok' || s === 'weak') return s;
  if (s === 'good' || s === 'solid') return 'ok';
  if (s === 'poor' || s === 'bad') return 'weak';
  return null;
}

/**
 * Enforce exactly REQUIRED_HASHTAG_COUNT unique hashtags.
 * Prefer LLM order, then research tags if provided later by caller.
 */
export function enforceExactHashtagCount(
  tags: string[],
  extras: string[] = [],
  count = REQUIRED_HASHTAG_COUNT
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...tags, ...extras]) {
    const tag = raw.trim().replace(/^#/, '').toLowerCase();
    if (!tag || seen.has(tag)) continue;
    // Keep original casing from first occurrence.
    const original = raw.trim().replace(/^#/, '');
    seen.add(tag);
    out.push(original);
    if (out.length >= count) break;
  }
  // Pad with generic niche-safe placeholders only if model under-delivered —
  // caller should prefer research extras; still keep length exact for product rule.
  let i = 1;
  while (out.length < count) {
    const pad = `ascendcontent${i}`;
    if (!seen.has(pad)) {
      seen.add(pad);
      out.push(pad);
    }
    i += 1;
  }
  return out.slice(0, count);
}

export function parseGeneration(
  raw: unknown,
  formatFallback: ContentFormat,
  options?: { slideCount?: number }
): GenerationPayload {
  if (!raw || typeof raw !== 'object') throw new Error('invalid_ai_json');
  const o = raw as Record<string, unknown>;
  const visual = asNullableString(o.visual_summary, 4000);
  if (!visual) throw new Error('missing_visual_summary');

  const hook = asNullableString(o.hook, 280) ?? '';
  const caption = asNullableString(o.caption, 2200) ?? '';
  const cta = asNullableString(o.cta, 280) ?? '';
  if (!hook || !caption) throw new Error('missing_draft_fields');

  const keywords = asStringArray(o.keywords, 16);
  const hashtagsRaw = asStringArray(o.hashtags, 18);
  const hashtags = enforceExactHashtagCount(hashtagsRaw);
  const slideCount = options?.slideCount ?? 1;

  return {
    visual_summary: visual,
    theme: asNullableString(o.theme, 200),
    audience_hint: asNullableString(o.audience_hint, 400),
    mood: asNullableString(o.mood, 120),
    content_category: asNullableString(o.content_category, 120),
    message: asNullableString(o.message, 400),
    product_hint: asNullableString(o.product_hint, 200),
    uncertain: asStringArray(o.uncertain, 12),
    content_type: normalizeFormat(o.content_type ?? o.format, formatFallback),
    content_intent: asNullableString(o.content_intent ?? o.intent, 400),
    core_message: asNullableString(o.core_message ?? o.message, 400),
    problem: asNullableString(o.problem, 400),
    emotion: asNullableString(o.emotion, 200),
    why_swipe: asNullableString(o.why_swipe, 400),
    why_save: asNullableString(o.why_save, 400),
    why_share: asNullableString(o.why_share, 400),
    hook,
    hook_strength: normalizeHookStrength(o.hook_strength),
    hook_alternatives: asStringArray(o.hook_alternatives, 3),
    caption,
    keywords,
    keyword_details: parseKeywordDetails(o.keyword_details ?? o.keywords_detail, keywords),
    hashtags,
    hashtag_details: parseHashtagDetails(o.hashtag_details ?? o.hashtags_detail, hashtags),
    cta,
    target_audience: asNullableString(o.target_audience, 400),
    posting_hint: asNullableString(o.posting_hint, 400),
    optimization: asNullableString(o.optimization ?? o.optimierung, 2000),
    slides: parseSlides(o.slides ?? o.carousel_slides, slideCount),
    llm_clean_flags: asStringArray(o.llm_clean_flags ?? o.clean_check_flags, 12),
  };
}
