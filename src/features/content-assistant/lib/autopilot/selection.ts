/**
 * Client mirror of edge Autopilot selection scoring (unit-tested).
 * Source of truth: supabase/functions/_shared/content-autopilot/selection.ts
 *
 * Variable order (must stay): eligibility → category → reasons/score → adjustments → return.
 */

import { isEligibleAutopilotAsset } from './eligibility';

export const AUTOPILOT_ASSET_COOLDOWN_DAYS = 3;

export interface SelectionAsset {
  id: string;
  scope: string;
  media_kind: string;
  mime_type: string | null;
  storage_path: string | null;
  analysis_status: string | null;
  theme: string | null;
  keywords: string[] | null;
  suggested_formats: string[] | null;
  last_used_at: string | null;
  usage_count: number;
}

export interface SelectionHistoryItem {
  assetId: string | null;
  category: string | null;
  publishedAt: string;
}

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

function daysBetween(isoA: string, isoB: string): number {
  return Math.abs(new Date(isoA).getTime() - new Date(isoB).getTime()) / (24 * 60 * 60 * 1000);
}

function daypartFromHour(hour: number): 'morning' | 'midday' | 'afternoon' | 'evening' {
  if (hour < 11) return 'morning';
  if (hour < 15) return 'midday';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

const WEEKDAY_CATEGORIES: Record<WeekdayIndex, string[]> = {
  1: ['motivation', 'business', 'goals', 'recruiting', 'weekstart'],
  2: ['education', 'tips', 'product', 'value'],
  3: ['team', 'community', 'storytelling', 'education'],
  4: ['business', 'recruiting', 'product', 'socialproof'],
  5: ['lifestyle', 'personality', 'team', 'community'],
  6: ['lifestyle', 'everyday', 'personality', 'community'],
  0: ['reflection', 'motivation', 'planning', 'personalstory'],
};

const DAYPART_CATEGORIES = {
  morning: ['motivation', 'daystart', 'personality', 'story'],
  midday: ['education', 'value', 'carousel', 'product'],
  afternoon: ['community', 'lifestyle', 'interaction'],
  evening: ['recruiting', 'storytelling', 'business', 'reel', 'cta'],
} as const;

export function preferredCategoriesForSlot(params: {
  weekday: WeekdayIndex;
  hour: number;
}): string[] {
  const day = WEEKDAY_CATEGORIES[params.weekday] ?? [];
  const part = DAYPART_CATEGORIES[daypartFromHour(params.hour)] ?? [];
  return [...new Set([...day, ...part])];
}

export function inferCategoryFromAsset(params: {
  theme: string | null | undefined;
  keywords: string[] | null | undefined;
  suggestedFormats: string[] | null | undefined;
}): string {
  const blob = [params.theme ?? '', ...(params.keywords ?? []), ...(params.suggestedFormats ?? [])]
    .join(' ')
    .toLowerCase();

  const rules: Array<[string, RegExp]> = [
    ['recruiting', /recruit|team.?aufbau|bewerb|nebenverdienst|network.?market/],
    ['product', /produkt|parfum|duft|fragrance|packaging|product/],
    ['education', /tipp|learn|wissen|howto|erklä|educat|mehrwert/],
    ['lifestyle', /lifestyle|alltag|everyday|leben|mood/],
    ['storytelling', /story|erzähl|journey|weg/],
    ['team', /team|community|zusammen|wir/],
    ['business', /business|umsatz|ziele|fokus|mindset/],
    ['motivation', /motivation|inspiration|start|montag/],
    ['socialproof', /erfolg|proof|testimon|ergebnis|kunden/],
  ];
  for (const [cat, re] of rules) {
    if (re.test(blob)) return cat;
  }
  return 'general';
}

export function scoreAutopilotCandidate(params: {
  asset: SelectionAsset;
  slotKind: 'feed' | 'story';
  weekday: WeekdayIndex;
  hour: number;
  nowIso: string;
  reservedAssetIds: ReadonlySet<string>;
  history: readonly SelectionHistoryItem[];
}): { asset: SelectionAsset; score: number; category: string; reasons: string[] } | null {
  const { asset, slotKind, weekday, hour, nowIso, reservedAssetIds, history } = params;
  if (!isEligibleAutopilotAsset(asset)) return null;
  if (reservedAssetIds.has(asset.id)) return null;

  // ORDER CRITICAL: category + score + reasons before any mutation
  const category = inferCategoryFromAsset({
    theme: asset.theme,
    keywords: asset.keywords,
    suggestedFormats: asset.suggested_formats,
  });
  const preferred = preferredCategoriesForSlot({ weekday, hour });
  const reasons: string[] = [];
  let score = 50;

  if (preferred.includes(category)) {
    score += 18;
    reasons.push(`Passt zu Wochentag/Uhrzeit (${category}).`);
  } else if (category === 'general') {
    score += 2;
  } else {
    score += 6;
  }

  if (slotKind === 'story' && asset.media_kind === 'video') {
    score -= 6;
    reasons.push('Video-Story — Bild-Story bevorzugt.');
  }

  const usage = Number(asset.usage_count ?? 0);
  if (usage === 0) {
    score += 20;
    reasons.push('Noch nicht verwendet.');
  } else if (usage <= 2) {
    score += 10;
    reasons.push('Wenige Verwendungen.');
  } else {
    score -= Math.min(15, usage);
  }

  if (asset.last_used_at) {
    const ago = daysBetween(asset.last_used_at, nowIso);
    if (ago < 1) {
      score -= 40;
      reasons.push('Heute bereits verwendet — stark abgewertet.');
    } else if (ago < AUTOPILOT_ASSET_COOLDOWN_DAYS) {
      score -= 25;
      reasons.push('Kürzlich verwendet.');
    } else if (ago > 14) {
      score += 8;
      reasons.push('Lange nicht verwendet.');
    }
  }

  const recentCategories = history
    .filter((h) => daysBetween(h.publishedAt, nowIso) <= 2)
    .map((h) => h.category)
    .filter(Boolean) as string[];
  if (recentCategories.includes(category)) {
    score -= 12;
    reasons.push('Ähnliche Kategorie kürzlich gepostet.');
  }

  const sameAssetRecent = history.some(
    (h) =>
      h.assetId === asset.id && daysBetween(h.publishedAt, nowIso) < AUTOPILOT_ASSET_COOLDOWN_DAYS
  );
  if (sameAssetRecent) {
    score -= 30;
    reasons.push('Asset in Cooldown.');
  }

  const formats = asset.suggested_formats ?? [];
  if (slotKind === 'story' && formats.includes('story')) score += 8;
  if (slotKind === 'feed' && (formats.includes('feed') || formats.includes('reel'))) score += 8;

  if (asset.scope === 'personal') score += 2;

  return { asset, score, category, reasons };
}

export function selectBestAutopilotAsset(params: {
  assets: readonly SelectionAsset[];
  slotKind: 'feed' | 'story';
  weekday: WeekdayIndex;
  hour: number;
  nowIso: string;
  reservedAssetIds: ReadonlySet<string>;
  history: readonly SelectionHistoryItem[];
  minScore?: number;
}): { asset: SelectionAsset; score: number; category: string; reasons: string[] } | null {
  const minScore = params.minScore ?? 35;
  const scored = [];
  for (const asset of params.assets) {
    const s = scoreAutopilotCandidate({
      asset,
      slotKind: params.slotKind,
      weekday: params.weekday,
      hour: params.hour,
      nowIso: params.nowIso,
      reservedAssetIds: params.reservedAssetIds,
      history: params.history,
    });
    if (s) scored.push(s);
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0] ?? null;
  if (!best || best.score < minScore) return null;
  return best;
}
