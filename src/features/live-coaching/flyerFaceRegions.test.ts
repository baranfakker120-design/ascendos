import { describe, expect, it } from 'vitest';
import {
  clearFlyerFaceCache,
  fallbackFlyerGlowRegions,
  mapContainBoxToPercent,
} from './flyerFaceRegions';

describe('flyerFaceRegions', () => {
  it('provides multi-spot cinematic fallback', () => {
    const regions = fallbackFlyerGlowRegions();
    expect(regions.length).toBeGreaterThanOrEqual(2);
    for (const r of regions) {
      expect(r.width).toBeGreaterThan(0);
      expect(r.height).toBeGreaterThan(0);
      expect(r.intensity).toBeGreaterThan(0);
    }
  });

  it('maps contain boxes into container percentages', () => {
    // Square image in tall 9:16 container → letterboxed vertically?
    // 900x1600 container, 900x900 image → scale=1, offsetY=350
    const mapped = mapContainBoxToPercent(
      { x: 100, y: 100, width: 200, height: 200 },
      { containerW: 900, containerH: 1600, imageW: 900, imageH: 900 }
    );
    expect(mapped).not.toBeNull();
    expect(mapped!.left).toBeGreaterThan(0);
    expect(mapped!.top).toBeGreaterThan(0);
    expect(mapped!.width).toBeGreaterThan(0);
  });

  it('returns null for invalid layout', () => {
    expect(
      mapContainBoxToPercent(
        { x: 0, y: 0, width: 10, height: 10 },
        { containerW: 0, containerH: 100, imageW: 10, imageH: 10 }
      )
    ).toBeNull();
  });

  it('clears cache without throwing', () => {
    clearFlyerFaceCache();
    expect(true).toBe(true);
  });
});
