import { describe, expect, it } from 'vitest';
import {
  AUTOPILOT_CAROUSEL_MAX,
  clampCarouselIds,
  isCarouselMode,
  resolveFeedBundleFormat,
  targetCarouselSize,
} from './carouselBundle';

describe('autopilot carousel bundle', () => {
  it('1 image → single; 2–10 → carousel', () => {
    expect(isCarouselMode(1)).toBe(false);
    expect(resolveFeedBundleFormat(['a']).isCarousel).toBe(false);
    expect(resolveFeedBundleFormat(['a', 'b']).isCarousel).toBe(true);
    expect(resolveFeedBundleFormat(['a', 'b', 'c', 'd', 'e', 'f']).isCarousel).toBe(true);
    expect(resolveFeedBundleFormat(Array.from({ length: 10 }, (_, i) => `i${i}`)).isCarousel).toBe(
      true
    );
  });

  it('caps at 10 and drops duplicates', () => {
    expect(AUTOPILOT_CAROUSEL_MAX).toBe(10);
    const eleven = Array.from({ length: 11 }, (_, i) => `i${i}`);
    expect(clampCarouselIds(eleven)).toHaveLength(10);
    expect(clampCarouselIds(['a', 'a', 'b', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(resolveFeedBundleFormat(eleven).assetIds).toHaveLength(10);
  });

  it('targets larger carousels at midday when assets allow', () => {
    expect(targetCarouselSize({ hour: 13, availableEligible: 20 })).toBe(5);
    expect(targetCarouselSize({ hour: 9, availableEligible: 20 })).toBe(1);
    expect(targetCarouselSize({ hour: 13, availableEligible: 2 })).toBe(2);
  });
});
