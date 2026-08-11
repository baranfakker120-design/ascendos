import { describe, expect, it } from 'vitest';
import {
  AUTOPILOT_MAX_FEED_PER_DAY,
  AUTOPILOT_MAX_STORIES_PER_DAY,
  AUTOPILOT_MIN_ELIGIBLE_ASSETS,
  canActivateAutopilot,
  countByScope,
  countEligibleAssets,
  isEligibleAutopilotAsset,
} from './eligibility';

function asset(
  partial: Partial<{
    id: string;
    scope: string;
    media_kind: string;
    storage_path: string | null;
    analysis_status: string | null;
  }>
) {
  return {
    id: 'a',
    scope: 'personal',
    media_kind: 'image',
    mime_type: 'image/jpeg',
    storage_path: 'org/u/a/original.jpg',
    analysis_status: 'ready',
    ...partial,
  };
}

describe('autopilot eligibility — image only', () => {
  it('requires at least 10 eligible images across Meine + Zentrale', () => {
    const nine = Array.from({ length: 9 }, (_, i) =>
      asset({ id: `p${i}`, scope: i % 2 === 0 ? 'personal' : 'central' })
    );
    expect(canActivateAutopilot(nine)).toEqual({
      ok: false,
      count: 9,
      reason: 'below_min_assets',
    });
    expect(AUTOPILOT_MIN_ELIGIBLE_ASSETS).toBe(10);
    expect(canActivateAutopilot([...nine, asset({ id: 'p9' })])).toEqual({ ok: true, count: 10 });
  });

  it('allows pools above the gate (15 / 25 images)', () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => asset({ id: `i${i}` }));
    const twentyFive = Array.from({ length: 25 }, (_, i) => asset({ id: `i${i}` }));
    expect(canActivateAutopilot(fifteen)).toEqual({ ok: true, count: 15 });
    expect(canActivateAutopilot(twentyFive)).toEqual({ ok: true, count: 25 });
  });

  it('excludes videos from eligibility (library may still hold them)', () => {
    expect(
      isEligibleAutopilotAsset(
        asset({ id: 'v1', media_kind: 'video', storage_path: 'org/u/v1/clip.mp4' })
      )
    ).toBe(false);
    const mix = [
      ...Array.from({ length: 10 }, (_, i) => asset({ id: `img${i}` })),
      asset({ id: 'vid', media_kind: 'video', storage_path: 'org/u/vid/clip.mp4' }),
    ];
    expect(countEligibleAssets(mix)).toBe(10);
    expect(canActivateAutopilot(mix)).toEqual({ ok: true, count: 10 });
  });

  it('mix of images + videos counts only images toward the gate', () => {
    const assets = [
      ...Array.from({ length: 8 }, (_, i) => asset({ id: `img${i}` })),
      ...Array.from({ length: 5 }, (_, i) =>
        asset({ id: `vid${i}`, media_kind: 'video', storage_path: `org/u/v${i}.mp4` })
      ),
    ];
    expect(countEligibleAssets(assets)).toBe(8);
    expect(canActivateAutopilot(assets).ok).toBe(false);
  });

  it('counts personal + central together and ignores broken assets', () => {
    const assets = [
      asset({ id: '1', scope: 'personal' }),
      asset({ id: '2', scope: 'central' }),
      asset({ id: '3', scope: 'personal', storage_path: null }),
      asset({ id: '4', scope: 'central', analysis_status: 'failed' }),
      asset({ id: '5', scope: 'personal', media_kind: 'video' }),
    ];
    expect(countEligibleAssets(assets)).toBe(2);
    expect(countByScope(assets)).toEqual({ personal: 1, central: 1, total: 2 });
  });

  it('caps daily feed/stories at 3', () => {
    expect(AUTOPILOT_MAX_FEED_PER_DAY).toBe(3);
    expect(AUTOPILOT_MAX_STORIES_PER_DAY).toBe(3);
  });
});
