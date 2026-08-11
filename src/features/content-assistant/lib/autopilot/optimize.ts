/**
 * Client mirror of Autopilot content-optimization pure helpers (unit-tested).
 * Source: supabase/functions/_shared/content-autopilot/optimize.ts
 */

export const REQUIRED_HASHTAG_COUNT = 5;
const FILLER_TAG_RE = /^(tag\d+|ascendcontent\d+|ascendos|content|fokus)$/i;
const MIN_PERFORMANCE_SAMPLES = 3;

export type AutopilotOptimizeMode = 'skip_story' | 'reuse' | 'refresh_copy' | 'hashtags_only';

export function shouldOptimizeAutopilotSlot(params: {
  slotKind: string;
  contentFormat: string;
}): boolean {
  if (params.slotKind === 'story' || params.contentFormat === 'story') return false;
  if (params.contentFormat === 'reel') return false;
  return params.slotKind === 'feed' || params.contentFormat === 'feed';
}

export function normalizeHashtagList(tags: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags ?? []) {
    const tag = String(raw).trim().replace(/^#/, '');
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key) || FILLER_TAG_RE.test(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export function extractAutopilotKeywords(params: {
  theme?: string | null;
  caption?: string | null;
  analysisKeywords?: string[] | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const k = raw.trim().replace(/^#/, '');
    if (k.length < 2) return;
    const key = k.toLowerCase();
    if (seen.has(key)) return;
    if (/\.(jpe?g|png|webp|heic|mp4|mov)$/i.test(k)) return;
    if (/^[a-f0-9]{8,}$/i.test(k)) return;
    seen.add(key);
    out.push(k);
  };
  for (const k of params.analysisKeywords ?? []) push(String(k));
  if (params.theme) {
    for (const part of params.theme.split(/[\s,/|·-]+/)) {
      if (part.length >= 3) push(part);
    }
  }
  if (params.caption) {
    for (const w of params.caption
      .replace(/[#@]/g, ' ')
      .split(/\s+/)
      .map((x) => x.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter((x) => x.length >= 4)
      .slice(0, 8)) {
      push(w);
    }
  }
  return out.slice(0, 12);
}

export function assessAutopilotOptimizeMode(draft: {
  hook: string | null;
  caption: string | null;
  cta: string | null;
  hashtags: string[] | null;
  format: string;
}): AutopilotOptimizeMode {
  if (draft.format === 'story') return 'skip_story';
  const caption = (draft.caption ?? '').trim();
  const hook = (draft.hook ?? '').trim();
  const cta = (draft.cta ?? '').trim();
  const tags = normalizeHashtagList(draft.hashtags);
  const hasGoodCaption = caption.length >= 40 && hook.length >= 8;
  const hasGoodTags = tags.length === REQUIRED_HASHTAG_COUNT;
  const hasCta = cta.length >= 4;
  if (hasGoodCaption && hasGoodTags && hasCta) return 'reuse';
  if (hasGoodCaption && hasCta && !hasGoodTags) return 'hashtags_only';
  return 'refresh_copy';
}

export function aggregatePerformanceContext(
  rows: ReadonlyArray<{ performance_json?: unknown | null }>
): { sampleSize: number; averages: Record<string, number>; hint: string | null } | null {
  const samples: Array<Record<string, number>> = [];
  for (const row of rows) {
    const m = (row.performance_json as { metrics?: Record<string, unknown> } | null)?.metrics;
    if (!m) continue;
    const entry: Record<string, number> = {};
    let any = false;
    for (const key of ['reach', 'likes', 'comments', 'saved', 'shares']) {
      const v = m[key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        entry[key] = v;
        any = true;
      }
    }
    if (any) samples.push(entry);
  }
  if (samples.length < MIN_PERFORMANCE_SAMPLES) return null;
  const sum: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const s of samples) {
    for (const [k, v] of Object.entries(s)) {
      sum[k] = (sum[k] ?? 0) + v;
      counts[k] = (counts[k] ?? 0) + 1;
    }
  }
  const averages: Record<string, number> = {};
  for (const k of Object.keys(sum)) averages[k] = Math.round(sum[k] / counts[k]);
  return { sampleSize: samples.length, averages, hint: 'Use varied hooks; avoid repeating recent caption patterns.' };
}

/** Exact-5 selection with evergreen pads — no tagN / trend claims. */
export function selectExactFiveHashtags(params: {
  llmHashtags: string[];
  catalogHashtags: string[];
  recentHashtags?: readonly string[];
}): string[] {
  const recent = new Set(
    (params.recentHashtags ?? []).map((t) => t.replace(/^#/, '').toLowerCase())
  );
  const ranked = normalizeHashtagList([...params.llmHashtags, ...params.catalogHashtags]).sort(
    (a, b) => {
      const ar = recent.has(a.toLowerCase()) ? 1 : 0;
      const br = recent.has(b.toLowerCase()) ? 1 : 0;
      return ar - br;
    }
  );
  const evergreen = [
    'businessmindset',
    'teamarbeit',
    'alltagsmomente',
    'netzwerk',
    'mindfulmoments',
    'leadership',
    'community',
  ];
  const out = normalizeHashtagList([...ranked, ...evergreen]).slice(0, REQUIRED_HASHTAG_COUNT);
  return out;
}

export function runAutopilotQualityCheck(params: {
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
}): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  if (!params.caption.trim()) notes.push('Caption missing.');
  if (!params.hook.trim()) notes.push('Hook missing.');
  if (!params.cta.trim()) notes.push('CTA missing.');
  const tags = normalizeHashtagList(params.hashtags);
  if (tags.length !== REQUIRED_HASHTAG_COUNT) notes.push('Hashtag count invalid.');
  if (params.hashtags.some((t) => FILLER_TAG_RE.test(String(t).replace(/^#/, '')))) {
    notes.push('Filler hashtags are not allowed.');
  }
  return { ok: notes.length === 0, notes };
}
