/**
 * Client mirror of Autopilot feed bundle / carousel sizing (unit-tested).
 * Source: supabase/functions/_shared/content-autopilot/carouselBundle.ts
 */

import { CAROUSEL_MAX_SLIDES } from '../carousel/selection';

export const AUTOPILOT_CAROUSEL_MAX = CAROUSEL_MAX_SLIDES;

export function isCarouselMode(count: number): boolean {
  return count >= 2;
}

export function clampCarouselIds(ids: readonly string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
    if (unique.length >= AUTOPILOT_CAROUSEL_MAX) break;
  }
  return unique;
}

export function resolveFeedBundleFormat(assetIds: readonly string[]): {
  contentFormat: 'feed';
  isCarousel: boolean;
  assetIds: string[];
} {
  const ids = clampCarouselIds(assetIds);
  return {
    contentFormat: 'feed',
    isCarousel: ids.length >= 2,
    assetIds: ids,
  };
}

export function targetCarouselSize(params: { hour: number; availableEligible: number }): number {
  let target = 1;
  if (params.hour >= 11 && params.hour < 15) target = 5;
  else if (params.hour >= 15 && params.hour < 18) target = 3;
  else if (params.hour >= 18) target = 2;
  target = Math.min(AUTOPILOT_CAROUSEL_MAX, Math.max(1, target));
  return Math.min(target, Math.max(1, params.availableEligible));
}
