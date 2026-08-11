import { describe, expect, it } from 'vitest';
import {
  AUTOPILOT_MAX_FEED_PER_DAY,
  AUTOPILOT_MAX_STORIES_PER_DAY,
  AUTOPILOT_MIN_ELIGIBLE_ASSETS,
  canActivateAutopilot,
  countByScope,
  countEligibleAssets,
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

describe('autopilot eligibility', () => {
  it('requires at least 10 eligible assets across Meine + Zentrale', () => {
    const nine = Array.from({ length: 9 }, (_, i) =>
      asset({ id: `p${i}`, scope: i % 2 === 0 ? 'personal' : 'central' })
    );
    expect(canActivateAutopilot(nine)).toEqual({
      ok: false,
      count: 9,
      reason: 'below_min_assets',
    });
    expect(AUTOPILOT_MIN_ELIGIBLE_ASSETS).toBe(10);
    const ten = [...nine, asset({ id: 'p9' })];
    expect(canActivateAutopilot(ten)).toEqual({ ok: true, count: 10 });
  });

  it('counts personal + central together and ignores broken assets', () => {
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
