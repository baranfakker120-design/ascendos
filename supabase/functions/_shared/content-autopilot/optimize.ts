/**
 * Autopilot Content Optimization V1 — pure helpers (no new AI provider).
 * Feed/Carousel only. Stories skip. No invented trends. Max one opt path per slot.
 */

import { REQUIRED_HASHTAG_COUNT } from '../content-generate/types.ts';
import { enforceExactHashtagCount } from '../content-generate/parse.ts';
import { runHeuristicCleanCheck } from '../content-generate/cleanCheck.ts';
import { runHashtagResearch } from '../content-research/pipeline.ts';
import { matchCuratedTopics } from '../content-research/curated-catalog.ts';
import { daypartFromHour, type Daypart } from './signals.ts';
import type { WeekdayIndex } from './signals.ts';

export type AutopilotOptimizeMode = 'skip_story' | 'reuse' | 'refresh_copy' | 'hashtags_only';

export interface AutopilotDraftSnapshot {
  hook: string | null;
  caption: string | null;
  cta: string | null;
  keywords: string[] | null;
  hashtags: string[] | null;
  format: string;
  analysis_json?: Record<string, unknown> | null;
}

export interface AutopilotTimingContext {
  weekday: WeekdayIndex;
  hour: number;
  daypart: Daypart;
  plannedForIso: string;
}

export interface AutopilotPerformanceMetrics {
  reach?: number;
  likes?: number;
  comments?: number;
  saved?: number;
  shares?: number;
}

export interface AutopilotPerformanceContext {
  sampleSize: number;
  averages: AutopilotPerformanceMetrics;
  /** Soft hint only — never invented Instagram insights. */
  hint: string | null;
}

const FILLER_TAG_RE = /^(tag\d+|ascendcontent\d+|ascendos|content|fokus)$/i;
const MIN_PERFORMANCE_SAMPLES = 3;

export function shouldOptimizeAutopilotSlot(params: {
  slotKind: string;
  contentFormat: string;
}): boolean {
  if (params.slotKind === 'story' || params.contentFormat === 'story') return false;
  if (params.contentFormat === 'reel') return false;
  return params.slotKind === 'feed' || params.contentFormat === 'feed';
}

export function buildTimingContext(plannedForIso: string): AutopilotTimingContext {
  const d = new Date(plannedForIso);
  const weekday = d.getUTCDay() as WeekdayIndex;
  // planned_for is stored as timestamptz approximating Berlin wall clock; hour from ISO is fine for daypart.
  const hour = d.getUTCHours();
  return {
    weekday,
    hour,
    daypart: daypartFromHour(hour),
    plannedForIso,
  };
}

/** Aggregate only when enough real samples exist — never invent metrics. */
export function aggregatePerformanceContext(
  rows: ReadonlyArray<{ performance_json?: unknown | null }>
): AutopilotPerformanceContext | null {
  const samples: AutopilotPerformanceMetrics[] = [];
  for (const row of rows) {
    const pj = row.performance_json as { metrics?: Record<string, unknown> } | null;
    const m = pj?.metrics;
    if (!m || typeof m !== 'object') continue;
    const entry: AutopilotPerformanceMetrics = {};
    let any = false;
    for (const key of ['reach', 'likes', 'comments', 'saved', 'shares'] as const) {
      const v = m[key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        entry[key] = v;
        any = true;
      }
    }
    if (any) samples.push(entry);
  }
  if (samples.length < MIN_PERFORMANCE_SAMPLES) return null;

  const sum: Required<AutopilotPerformanceMetrics> = {
    reach: 0,
    likes: 0,
    comments: 0,
    saved: 0,
    shares: 0,
  };
  const counts = { reach: 0, likes: 0, comments: 0, saved: 0, shares: 0 };
  for (const s of samples) {
    for (const key of Object.keys(sum) as Array<keyof typeof sum>) {
      if (typeof s[key] === 'number') {
        sum[key] += s[key]!;
        counts[key] += 1;
      }
    }
  }
  const averages: AutopilotPerformanceMetrics = {};
  for (const key of Object.keys(sum) as Array<keyof typeof sum>) {
    if (counts[key] > 0) averages[key] = Math.round(sum[key] / counts[key]);
  }

  let hint: string | null = null;
  if ((averages.saved ?? 0) >= (averages.likes ?? 0) && (averages.saved ?? 0) > 0) {
    hint = 'Saves are relatively strong — prefer saveable tips / value captions.';
  } else if ((averages.comments ?? 0) > (averages.likes ?? 0) * 0.15) {
    hint = 'Comments are relatively strong — prefer a clear question CTA.';
  } else if ((averages.reach ?? 0) > 0) {
    hint = 'Use varied hooks; avoid repeating recent caption patterns.';
  }

  return { sampleSize: samples.length, averages, hint };
}

/** Keywords from analysis/caption/theme — never filename. */
export function extractAutopilotKeywords(params: {
  theme?: string | null;
  caption?: string | null;
  analysisKeywords?: string[] | null;
  analysisJson?: Record<string, unknown> | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const k = raw.trim().replace(/^#/, '');
    if (k.length < 2) return;
    const key = k.toLowerCase();
    if (seen.has(key)) return;
    // Reject filename-like tokens
    if (/\.(jpe?g|png|webp|heic|mp4|mov)$/i.test(k)) return;
    if (/^[a-f0-9]{8,}$/i.test(k)) return;
    seen.add(key);
    out.push(k);
  };

  for (const k of params.analysisKeywords ?? []) push(String(k));
  const aj = params.analysisJson ?? {};
  if (Array.isArray(aj.keywords)) {
    for (const k of aj.keywords) push(String(k));
  }
  if (params.theme) {
    for (const part of params.theme.split(/[\s,/|·-]+/)) {
      if (part.length >= 3) push(part);
    }
  }
  if (params.caption) {
    const words = params.caption
      .replace(/[#@]/g, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter((w) => w.length >= 4);
    for (const w of words.slice(0, 8)) push(w);
  }
  return out.slice(0, 12);
}

export function normalizeHashtagList(tags: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags ?? []) {
    const tag = String(raw).trim().replace(/^#/, '');
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    if (FILLER_TAG_RE.test(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export function assessAutopilotOptimizeMode(draft: AutopilotDraftSnapshot): AutopilotOptimizeMode {
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

/**
 * Select exactly 5 hashtags. Relevance first; among equals prefer not-recently-used.
 * No trend claims. No tagN fillers — pad only from curated evergreen catalog.
 */
export function selectExactFiveHashtags(params: {
  theme: string | null;
  keywords: string[];
  llmHashtags: string[];
  caption?: string | null;
  contentCategory?: string | null;
  recentHashtags?: readonly string[];
}): { hashtags: string[]; liveResearchActive: false; notes: string[] } {
  const research = runHashtagResearch({
    theme: params.theme ?? undefined,
    keywords: params.keywords,
    llmHashtags: params.llmHashtags,
    contentCategory: params.contentCategory ?? undefined,
    visualSummary: params.caption ?? undefined,
  });

  const recent = new Set(
    (params.recentHashtags ?? []).map((t) => t.replace(/^#/, '').toLowerCase())
  );

  const ranked = [...research.recommended].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aRecent = recent.has(a.tag.toLowerCase()) ? 1 : 0;
    const bRecent = recent.has(b.tag.toLowerCase()) ? 1 : 0;
    return aRecent - bRecent;
  });

  let tags = normalizeHashtagList(ranked.map((c) => c.tag));

  if (tags.length < REQUIRED_HASHTAG_COUNT) {
    const blob = [params.theme, params.contentCategory, ...(params.keywords ?? [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const topics = matchCuratedTopics(blob.length >= 3 ? blob : 'business team lifestyle');
    const catalogPads: string[] = [];
    for (const topic of topics) {
      for (const h of topic.hashtags) catalogPads.push(h);
    }
    // Broad evergreen fallbacks (never spam/generic fyp/love)
    catalogPads.push(
      'businessmindset',
      'teamarbeit',
      'alltagsmomente',
      'netzwerk',
      'mindfulmoments',
      'leadership',
      'community'
    );
    tags = normalizeHashtagList([...tags, ...catalogPads]);
  }

  const exact = enforceExactHashtagCount(tags, [], REQUIRED_HASHTAG_COUNT).filter(
    (t) => !FILLER_TAG_RE.test(t)
  );

  // If enforce padded with ascendcontent*, replace from catalog
  if (exact.length < REQUIRED_HASHTAG_COUNT || exact.some((t) => FILLER_TAG_RE.test(t))) {
    const catalogPads = [
      'businessmindset',
      'teamarbeit',
      'alltagsmomente',
      'netzwerk',
      'mindfulmoments',
      'leadership',
      'community',
      'duftliebe',
      'fragrance',
      'scentoftheday',
    ];
    const repaired = enforceExactHashtagCount(
      normalizeHashtagList([...exact, ...catalogPads]),
      [],
      REQUIRED_HASHTAG_COUNT
    );
    return {
      hashtags: repaired.slice(0, REQUIRED_HASHTAG_COUNT),
      liveResearchActive: false,
      notes: [...research.notes, 'Evergreen catalog used to reach exactly 5 hashtags.'],
    };
  }

  return {
    hashtags: exact.slice(0, REQUIRED_HASHTAG_COUNT),
    liveResearchActive: false,
    notes: research.notes,
  };
}

export function runAutopilotQualityCheck(params: {
  hook: string;
  caption: string;
  cta: string;
  keywords: string[];
  hashtags: string[];
}): { ok: boolean; status: 'clean' | 'attention'; notes: string[] } {
  const notes: string[] = [];
  if (!params.caption.trim()) notes.push('Caption missing.');
  if (params.caption.trim().length < 12) notes.push('Caption too short.');
  if (!params.hook.trim()) notes.push('Hook missing.');
  if (!params.cta.trim()) notes.push('CTA missing.');
  const tags = normalizeHashtagList(params.hashtags);
  if (tags.length !== REQUIRED_HASHTAG_COUNT) {
    notes.push(`Expected exactly ${REQUIRED_HASHTAG_COUNT} hashtags, got ${tags.length}.`);
  }
  if (params.hashtags.some((t) => FILLER_TAG_RE.test(String(t).replace(/^#/, '')))) {
    notes.push('Filler hashtags are not allowed.');
  }

  const clean = runHeuristicCleanCheck({
    hook: params.hook,
    caption: params.caption,
    cta: params.cta,
    keywords: params.keywords,
    hashtags: tags,
    llmFlags: [],
  });
  notes.push(...clean.notes);

  const hardFail =
    !params.caption.trim() ||
    tags.length !== REQUIRED_HASHTAG_COUNT ||
    params.hashtags.some((t) => FILLER_TAG_RE.test(String(t).replace(/^#/, '')));

  return {
    ok: !hardFail && clean.status === 'clean',
    status: hardFail ? 'attention' : clean.status,
    notes,
  };
}

/** Light caption touch-up when reuse path — inject timing hint without full rewrite. */
export function lightlyTuneCaption(params: {
  caption: string;
  hook: string;
  cta: string;
  timing: AutopilotTimingContext;
  performance: AutopilotPerformanceContext | null;
  recentCaptions?: readonly string[];
}): { caption: string; hook: string; cta: string; changed: boolean } {
  let caption = params.caption.trim();
  let hook = params.hook.trim();
  let cta = params.cta.trim();
  let changed = false;

  // Avoid near-duplicate of the most recent caption
  const recent = (params.recentCaptions ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean);
  if (recent[0] && caption.toLowerCase() === recent[0] && caption.length > 20) {
    // Soft variation: ensure hook leads if not already
    if (hook && !caption.toLowerCase().startsWith(hook.toLowerCase().slice(0, 12))) {
      caption = `${hook}\n\n${caption}`;
      changed = true;
    }
  }

  if (!cta) {
    cta =
      params.performance?.hint?.includes('question')
        ? 'Was ist deine Erfahrung? Schreib es in die Kommentare.'
        : 'Speichere diesen Beitrag für später.';
    changed = true;
  }

  if (!hook && caption) {
    hook = caption.split(/[.!?\n]/)[0]?.trim().slice(0, 120) || caption.slice(0, 80);
    changed = true;
  }

  // Timing is contextual metadata for AI refresh; light path keeps caption body.
  void params.timing;

  return { caption, hook, cta, changed };
}
