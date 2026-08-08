import type { ContentFormat, GenerationPayload } from './types.ts';

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

export function parseGeneration(raw: unknown, formatFallback: ContentFormat): GenerationPayload {
  if (!raw || typeof raw !== 'object') throw new Error('invalid_ai_json');
  const o = raw as Record<string, unknown>;
  const visual = asNullableString(o.visual_summary, 4000);
  if (!visual) throw new Error('missing_visual_summary');

  const hook = asNullableString(o.hook, 280) ?? '';
  const caption = asNullableString(o.caption, 2200) ?? '';
  const cta = asNullableString(o.cta, 280) ?? '';
  if (!hook || !caption) throw new Error('missing_draft_fields');

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
    hook,
    caption,
    keywords: asStringArray(o.keywords, 16),
    hashtags: asStringArray(o.hashtags, 18),
    cta,
    target_audience: asNullableString(o.target_audience, 400),
    posting_hint: asNullableString(o.posting_hint, 400),
    llm_clean_flags: asStringArray(o.llm_clean_flags ?? o.clean_check_flags, 12),
  };
}
