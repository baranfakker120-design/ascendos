/**
 * Client mirror of Autopilot feed bundle rules (unit-tested).
 * Source: supabase/functions/_shared/content-autopilot/carouselBundle.ts
 *
 * Hard rule: Autopilot feed = exactly 1 image. Never carousel.
 * Manual carousel lives in ../carousel/* and is untouched.
 */

import { CAROUSEL_MAX_SLIDES } from '../carousel/selection';

/** Instagram Graph max — reference only; Autopilot never multi-slides. */
export const AUTOPILOT_CAROUSEL_MAX = CAROUSEL_MAX_SLIDES;

/** Autopilot never publishes carousels. */
export function isCarouselMode(count: number): boolean {
  void count;
  return false;
}

/** Autopilot feed: keep only the first asset id. */
export function clampCarouselIds(ids: readonly string[]): string[] {
  for (const id of ids) {
    if (id) return [id];
  }
  return [];
}

/**
 * Collapse a legacy Autopilot multi-asset feed to single-image.
 * Does not touch caption / hashtags / CTA (those live on the draft).
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
  const hasExtra = companions.length >= 2 || companions.some((id) => id && id !== params.assetId);
  return {
    assetId: primary,
    carouselAssetIds: [],
    isCarousel: false,
    contentFormat: 'feed',
    collapsed: hasExtra,
  };
}

/** Draft fields that MUST be preserved when collapsing Autopilot carousel → single. */
export function autopilotCollapseDraftPatch(params: { assetId: string }): {
  asset_id: string;
  carousel_asset_ids: [];
  status: 'ready';
} {
  return {
    asset_id: params.assetId,
    carousel_asset_ids: [],
    status: 'ready',
  };
}

export function resolveFeedBundleFormat(assetIds: readonly string[]): {
  contentFormat: 'feed';
  isCarousel: false;
  assetIds: string[];
} {
  const ids = clampCarouselIds(assetIds);
  return {
    contentFormat: 'feed',
    isCarousel: false,
    assetIds: ids,
  };
}

/** Hard block: Autopilot feed target is always 1 (morning/midday/afternoon/evening). */
export function targetCarouselSize(params: { hour: number; availableEligible: number }): number {
  void params;
  return 1;
}
