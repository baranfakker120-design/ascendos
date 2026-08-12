/**
 * Autopilot feed bundle: ALWAYS exactly 1 image.
 *
 * Hard rule (2026-08): Autopilot must never plan, reserve, or publish carousels.
 * Manual Content Assistant carousel (lib/carousel/*) is unrelated and untouched.
 */

import { CAROUSEL_MAX_ASSETS } from '../content-generate/types.ts';
import { isEligibleAutopilotFeedAsset } from './eligibility.ts';
import { selectBestAutopilotAsset } from './selection.ts';
import type { AutopilotEligibleAsset, AutopilotHistoryItem } from './types.ts';
import type { WeekdayIndex } from './signals.ts';

/** Kept for Instagram Graph max reference — Autopilot never uses multi-slide. */
export const AUTOPILOT_CAROUSEL_MAX = CAROUSEL_MAX_ASSETS; // 10

export interface AutopilotFeedBundle {
  assets: AutopilotEligibleAsset[];
  primary: AutopilotEligibleAsset;
  category: string;
  reasons: string[];
  /** Always 'feed' for image autopilot (never reel). */
  contentFormat: 'feed';
  /** Always false — Autopilot feed is single-image only. */
  isCarousel: false;
}

/**
 * Autopilot hard block: feed target size is always exactly 1.
 * Daypart no longer expands to 2/3/5.
 */
export function targetCarouselSize(_params: {
  hour: number;
  availableEligible: number;
}): number {
  return 1;
}

/** Autopilot feed ids: keep only the primary (first) asset. */
export function clampAutopilotFeedAssetIds(ids: readonly string[]): string[] {
  for (const id of ids) {
    if (id) return [id];
  }
  return [];
}

/**
 * Collapse a legacy Autopilot multi-asset feed slot to single-image.
 * Preserves primary; clears companions. Does not touch caption/hashtags/cta.
 */
export function collapseAutopilotFeedToSingle(params: {
  assetId: string | null;
  carouselAssetIds: readonly string[];
}): {
  assetId: string | null;
  carouselAssetIds: [];
  isCarousel: false;
  contentFormat: 'feed';
  collapsed: boolean;
} {
  const companions = params.carouselAssetIds.filter((id) => Boolean(id));
  const primary = params.assetId || companions[0] || null;
  const hasExtra =
    companions.length >= 2 || companions.some((id) => id && id !== params.assetId);
  return {
    assetId: primary,
    carouselAssetIds: [],
    isCarousel: false,
    contentFormat: 'feed',
    collapsed: hasExtra,
  };
}

export function selectAutopilotFeedBundle(params: {
  assets: readonly AutopilotEligibleAsset[];
  weekday: WeekdayIndex;
  hour: number;
  nowIso: string;
  reservedAssetIds: ReadonlySet<string>;
  history: readonly AutopilotHistoryItem[];
  minScore?: number;
}): AutopilotFeedBundle | null {
  void isEligibleAutopilotFeedAsset;
  const best = selectBestAutopilotAsset({
    assets: params.assets,
    slotKind: 'feed',
    weekday: params.weekday,
    hour: params.hour,
    nowIso: params.nowIso,
    reservedAssetIds: params.reservedAssetIds,
    history: params.history,
    minScore: params.minScore,
  });
  if (!best) return null;

  // Hard block: never pick additional slides, regardless of hour / pool size.
  void targetCarouselSize({
    hour: params.hour,
    availableEligible: params.assets.length,
  });

  return {
    assets: [best.asset],
    primary: best.asset,
    category: best.category,
    reasons: [...best.reasons.slice(0, 2), 'Single-Image Feed (Autopilot — kein Carousel).'],
    contentFormat: 'feed',
    isCarousel: false,
  };
}
