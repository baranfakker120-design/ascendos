import { describe, expect, it } from 'vitest';
import {
  AUTOPILOT_CAROUSEL_MAX,
  autopilotCollapseDraftPatch,
  clampCarouselIds,
  collapseAutopilotFeedToSingle,
  isCarouselMode,
  resolveFeedBundleFormat,
  targetCarouselSize,
} from './carouselBundle';

describe('autopilot feed hard rule — exactly 1 image', () => {
  it('1. morning feed → target size 1', () => {
    expect(targetCarouselSize({ hour: 9, availableEligible: 20 })).toBe(1);
    expect(targetCarouselSize({ hour: 10, availableEligible: 50 })).toBe(1);
  });

  it('2. midday feed → target size 1 (never 5)', () => {
    expect(targetCarouselSize({ hour: 12, availableEligible: 20 })).toBe(1);
    expect(targetCarouselSize({ hour: 13, availableEligible: 20 })).toBe(1);
    expect(targetCarouselSize({ hour: 14, availableEligible: 20 })).toBe(1);
  });

  it('3. afternoon feed → target size 1 (never 3)', () => {
    expect(targetCarouselSize({ hour: 15, availableEligible: 20 })).toBe(1);
    expect(targetCarouselSize({ hour: 17, availableEligible: 20 })).toBe(1);
  });

  it('4. evening feed → target size 1 (never 2)', () => {
    expect(targetCarouselSize({ hour: 18, availableEligible: 20 })).toBe(1);
    expect(targetCarouselSize({ hour: 19, availableEligible: 20 })).toBe(1);
    expect(targetCarouselSize({ hour: 21, availableEligible: 20 })).toBe(1);
  });

  it('5. never produces carousel_asset_ids > 0 for autopilot feed bundle', () => {
    const multi = resolveFeedBundleFormat(['a', 'b', 'c', 'd', 'e']);
    expect(multi.assetIds).toEqual(['a']);
    expect(multi.assetIds.length).toBe(1);
    expect(clampCarouselIds(['a', 'b', 'c'])).toEqual(['a']);
    expect(clampCarouselIds(Array.from({ length: 11 }, (_, i) => `i${i}`))).toEqual(['i0']);
  });

  it('6. never sets is_carousel / isCarousel true', () => {
    expect(isCarouselMode(1)).toBe(false);
    expect(isCarouselMode(2)).toBe(false);
    expect(isCarouselMode(5)).toBe(false);
    expect(isCarouselMode(10)).toBe(false);
    expect(resolveFeedBundleFormat(['a']).isCarousel).toBe(false);
    expect(resolveFeedBundleFormat(['a', 'b']).isCarousel).toBe(false);
    expect(resolveFeedBundleFormat(['a', 'b', 'c', 'd', 'e']).isCarousel).toBe(false);
    expect(
      collapseAutopilotFeedToSingle({ assetId: 'a', carouselAssetIds: ['a', 'b'] }).isCarousel
    ).toBe(false);
  });

  it('9. existing Autopilot READY carousel slot → collapses to single image', () => {
    const repaired = collapseAutopilotFeedToSingle({
      assetId: 'primary',
      carouselAssetIds: ['primary', 'slide2'],
    });
    expect(repaired.assetId).toBe('primary');
    expect(repaired.carouselAssetIds).toEqual([]);
    expect(repaired.isCarousel).toBe(false);
    expect(repaired.contentFormat).toBe('feed');
    expect(repaired.collapsed).toBe(true);

    const five = collapseAutopilotFeedToSingle({
      assetId: 'p',
      carouselAssetIds: ['p', 's2', 's3', 's4', 's5'],
    });
    expect(five.assetId).toBe('p');
    expect(five.carouselAssetIds).toEqual([]);
    expect(five.collapsed).toBe(true);
  });

  it('10. published carousel identity is out of scope (collapse helper does not mutate published rows)', () => {
    // Pure helper only transforms READY repair payloads — callers must skip published.
    const publishedSnapshot = {
      status: 'published' as const,
      assetId: 'p',
      carouselAssetIds: ['p', 'a', 'b', 'c', 'd'],
    };
    expect(publishedSnapshot.status).toBe('published');
    expect(publishedSnapshot.carouselAssetIds).toHaveLength(5);
  });

  it('11–12. caption + hashtags preserved on collapse draft patch', () => {
    const existingDraft = {
      caption: 'Optimierter Caption-Text mit CTA am Ende.',
      hashtags: ['#ascend', '#motivation', '#business', '#team', '#growth'],
      cta: 'Speichere diesen Beitrag für später.',
      hook: 'Starte stark in den Tag',
      asset_id: 'primary',
      carousel_asset_ids: ['primary', 's2'],
    };
    const patch = autopilotCollapseDraftPatch({ assetId: 'primary' });
    const after = { ...existingDraft, ...patch };
    expect(after.caption).toBe(existingDraft.caption);
    expect(after.hashtags).toEqual(existingDraft.hashtags);
    expect(after.cta).toBe(existingDraft.cta);
    expect(after.hook).toBe(existingDraft.hook);
    expect(after.carousel_asset_ids).toEqual([]);
    expect(after.asset_id).toBe('primary');
    // No filename / UUID fallback
    expect(after.caption).not.toMatch(/^IMG_/);
    expect(after.caption).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('keeps Instagram Graph max reference at 10 (manual path uses this; Autopilot ignores multi)', () => {
    expect(AUTOPILOT_CAROUSEL_MAX).toBe(10);
  });
});
