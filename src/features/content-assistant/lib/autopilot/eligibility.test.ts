import { describe, expect, it } from 'vitest';
import {
  AUTOPILOT_MAX_FEED_PER_DAY,
  AUTOPILOT_MAX_STORIES_PER_DAY,
  AUTOPILOT_MIN_ELIGIBLE_ASSETS,
  canActivateAutopilot,
  countByScope,
  countEligibleAssets,
  countEligibleFeedAssets,
  isEligibleAutopilotAsset,
  isEligibleAutopilotFeedAsset,
  isEligibleAutopilotStoryAsset,
  isEligibleForSlotKind,
} from './eligibility';

function asset(
  partial: Partial<{
    id: string;
    scope: string;
    media_kind: string;
    storage_path: string | null;
    analysis_status: string | null;
    aspect_ratio: string | null;
    suggested_formats: string[] | null;
  }>
) {
  return {
    id: 'a',
    scope: 'personal',
    media_kind: 'image',
    mime_type: 'image/jpeg',
    storage_path: 'org/u/a/original.jpg',
    analysis_status: 'ready',
    aspect_ratio: null as string | null,
    suggested_formats: null as string[] | null,
    ...partial,
  };
}

describe('autopilot eligibility V2 — gate vs feed vs story pools', () => {
  it('gate counts images + videos (>=10)', () => {
    const mix = [
      ...Array.from({ length: 7 }, (_, i) => asset({ id: `img${i}` })),
      ...Array.from({ length: 3 }, (_, i) =>
        asset({ id: `vid${i}`, media_kind: 'video', storage_path: `org/u/v${i}.mp4` })
      ),
    ];
    expect(countEligibleAssets(mix)).toBe(10);
    expect(canActivateAutopilot(mix)).toEqual({ ok: true, count: 10 });
    expect(AUTOPILOT_MIN_ELIGIBLE_ASSETS).toBe(10);
  });

  it('allows pools above the gate (15 / 25)', () => {
    expect(
      canActivateAutopilot(Array.from({ length: 15 }, (_, i) => asset({ id: `i${i}` })))
    ).toEqual({ ok: true, count: 15 });
    expect(
      canActivateAutopilot(Array.from({ length: 25 }, (_, i) => asset({ id: `i${i}` })))
    ).toEqual({ ok: true, count: 25 });
  });

  it('feed pool is image-only; story pool allows video', () => {
    const img = asset({ id: 'img' });
    const vid = asset({ id: 'vid', media_kind: 'video', storage_path: 'org/u/v.mp4' });
    expect(isEligibleAutopilotFeedAsset(img)).toBe(true);
    expect(isEligibleAutopilotFeedAsset(vid)).toBe(false);
    expect(isEligibleAutopilotStoryAsset(vid)).toBe(true);
    expect(isEligibleForSlotKind(vid, 'feed')).toBe(false);
    expect(isEligibleForSlotKind(vid, 'story')).toBe(true);
    expect(isEligibleForSlotKind(img, 'feed')).toBe(true);
  });

  it('hard-rejects wrong aspect for story vs feed', () => {
    expect(isEligibleAutopilotStoryAsset(asset({ aspect_ratio: '1:1' }))).toBe(false);
    expect(isEligibleAutopilotStoryAsset(asset({ aspect_ratio: '9:16' }))).toBe(true);
    expect(isEligibleAutopilotFeedAsset(asset({ aspect_ratio: '9:16' }))).toBe(false);
    expect(isEligibleAutopilotFeedAsset(asset({ aspect_ratio: '4:5' }))).toBe(true);
  });

  it('gate pool != feed pool when videos present', () => {
    const assets = [
      ...Array.from({ length: 10 }, (_, i) => asset({ id: `img${i}` })),
      ...Array.from({ length: 5 }, (_, i) =>
        asset({ id: `vid${i}`, media_kind: 'video', storage_path: `org/u/v${i}.mp4` })
      ),
    ];
    expect(countEligibleAssets(assets)).toBe(15);
    expect(countEligibleFeedAssets(assets)).toBe(10);
  });

  it('videos still count toward gate; not deleted from eligibility', () => {
    expect(
      isEligibleAutopilotAsset(
        asset({ id: 'v1', media_kind: 'video', storage_path: 'org/u/v1/clip.mp4' })
      )
    ).toBe(true);
  });

  it('ignores broken assets in scope counts', () => {
    const assets = [
      asset({ id: '1', scope: 'personal' }),
      asset({ id: '2', scope: 'central' }),
      asset({ id: '3', scope: 'personal', storage_path: null }),
      asset({ id: '4', scope: 'central', analysis_status: 'failed' }),
    ];
    expect(countEligibleAssets(assets)).toBe(2);
    expect(countByScope(assets)).toEqual({ personal: 1, central: 1, total: 2 });
  });

  it('caps daily feed/stories at 3', () => {
    expect(AUTOPILOT_MAX_FEED_PER_DAY).toBe(3);
    expect(AUTOPILOT_MAX_STORIES_PER_DAY).toBe(3);
  });
});
