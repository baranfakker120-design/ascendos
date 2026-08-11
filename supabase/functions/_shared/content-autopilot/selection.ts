import {
  AUTOPILOT_ASSET_COOLDOWN_DAYS,
  type AutopilotEligibleAsset,
  type AutopilotHistoryItem,
  type AutopilotSlotKind,
  type ScoredCandidate,
} from './types.ts';
import { isEligibleAutopilotAsset } from './eligibility.ts';
import {
  inferCategoryFromAsset,
  preferredCategoriesForSlot,
  type WeekdayIndex,
} from './signals.ts';

function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  return Math.abs(a - b) / (24 * 60 * 60 * 1000);
}

export function scoreAutopilotCandidate(params: {
  asset: AutopilotEligibleAsset;
  slotKind: AutopilotSlotKind;
  weekday: WeekdayIndex;
  hour: number;
  nowIso: string;
  reservedAssetIds: ReadonlySet<string>;
  history: readonly AutopilotHistoryItem[];
}): ScoredCandidate | null {
  const { asset, slotKind, weekday, hour, nowIso, reservedAssetIds, history } = params;
  if (!isEligibleAutopilotAsset(asset)) return null;
  if (reservedAssetIds.has(asset.id)) return null;

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

  // Image-only Autopilot: videos are filtered in eligibility (not scored here).

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

  // Prefer matching suggested formats (image feed/story; reel suggestions ignored for auto-publish)
  const formats = asset.suggested_formats ?? [];
  if (slotKind === 'story' && formats.includes('story')) score += 8;
  if (slotKind === 'feed' && (formats.includes('feed') || formats.includes('carousel'))) score += 8;

  if (asset.scope === 'personal') score += 2;

  return { asset, score, category, reasons };
}

/**
 * Pick best candidate; returns null when nothing is good enough
 * (avoids forced low-quality / blind recycling).
 */
export function selectBestAutopilotAsset(params: {
  assets: readonly AutopilotEligibleAsset[];
  slotKind: AutopilotSlotKind;
  weekday: WeekdayIndex;
  hour: number;
  nowIso: string;
  reservedAssetIds: ReadonlySet<string>;
  history: readonly AutopilotHistoryItem[];
  /** Minimum score to accept — below → skip slot. */
  minScore?: number;
}): ScoredCandidate | null {
  const minScore = params.minScore ?? 35;
  const scored: ScoredCandidate[] = [];
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
