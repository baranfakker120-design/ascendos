/**
 * Autopilot feed bundle: 1 image → single feed; 2–10 images → carousel.
 * Images only. No duplicates. Respects reservation set.
 */

import { CAROUSEL_MAX_ASSETS } from '../content-generate/types.ts';
import { isEligibleAutopilotFeedAsset } from './eligibility.ts';
import { selectBestAutopilotAsset, scoreAutopilotCandidate } from './selection.ts';
import { daypartFromHour, type WeekdayIndex } from './signals.ts';
import type { AutopilotEligibleAsset, AutopilotHistoryItem } from './types.ts';

export const AUTOPILOT_CAROUSEL_MAX = CAROUSEL_MAX_ASSETS; // Instagram Graph hard max = 10

export interface AutopilotFeedBundle {
  assets: AutopilotEligibleAsset[];
  primary: AutopilotEligibleAsset;
  category: string;
  reasons: string[];
  /** Always 'feed' for image autopilot (never reel). */
  contentFormat: 'feed';
  isCarousel: boolean;
}

/** Target slide count for a feed slot (1–10). Midday prefers multi-image. */
export function targetCarouselSize(params: {
  hour: number;
  availableEligible: number;
}): number {
  const daypart = daypartFromHour(params.hour);
  let target = 1;
  if (daypart === 'midday') target = 5;
  else if (daypart === 'afternoon') target = 3;
  else if (daypart === 'evening') target = 2;
  else target = 1;

  target = Math.min(AUTOPILOT_CAROUSEL_MAX, Math.max(1, target));
  // Never request more than remaining eligible images
  return Math.min(target, Math.max(1, params.availableEligible));
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
  const eligiblePool = params.assets.filter(
    (a) => isEligibleAutopilotFeedAsset(a) && !params.reservedAssetIds.has(a.id)
  );
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

  const target = targetCarouselSize({
    hour: params.hour,
    availableEligible: eligiblePool.length,
  });

  const picked: AutopilotEligibleAsset[] = [best.asset];
  const reserved = new Set(params.reservedAssetIds);
  reserved.add(best.asset.id);

  if (target >= 2) {
    const scored = eligiblePool
      .filter((a) => a.id !== best.asset.id)
      .map((asset) =>
        scoreAutopilotCandidate({
          asset,
          slotKind: 'feed',
          weekday: params.weekday,
          hour: params.hour,
          nowIso: params.nowIso,
          reservedAssetIds: reserved,
          history: params.history,
        })
      )
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      // Prefer same category / theme cohesion for carousel slides
      .map((s) => {
        let bonus = 0;
        if (s.category === best.category) bonus += 12;
        if (
          best.asset.theme &&
          s.asset.theme &&
          String(s.asset.theme).toLowerCase() === String(best.asset.theme).toLowerCase()
        ) {
          bonus += 8;
        }
        return { ...s, score: s.score + bonus };
      })
      .sort((a, b) => b.score - a.score);

    for (const s of scored) {
      if (picked.length >= target) break;
      if (picked.length >= AUTOPILOT_CAROUSEL_MAX) break;
      if (reserved.has(s.asset.id)) continue;
      if (s.score < (params.minScore ?? 35) - 5) continue;
      picked.push(s.asset);
      reserved.add(s.asset.id);
    }
  }

  // Cap hard at 10; never pack 11+
  const assets = picked.slice(0, AUTOPILOT_CAROUSEL_MAX);
  const isCarousel = assets.length >= 2;
  const reasons = [
    ...best.reasons.slice(0, 2),
    isCarousel
      ? `Image-Carousel mit ${assets.length} Slides (max ${AUTOPILOT_CAROUSEL_MAX}).`
      : 'Single-Image Feed.',
  ];

  return {
    assets,
    primary: assets[0],
    category: best.category,
    reasons,
    contentFormat: 'feed',
    isCarousel,
  };
}
