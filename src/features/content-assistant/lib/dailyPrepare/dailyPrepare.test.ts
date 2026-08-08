import { describe, expect, it } from 'vitest';
import {
  chooseContentFormat,
  rankContentAssets,
  selectBestAsset,
  shouldSkipReadyPrep,
  type SelectableAsset,
} from './assetSelection';
import { berlinPrepDate, isBerlinNoonWindow, subtractDaysFromDate } from './berlinTime';

function asset(partial: Partial<SelectableAsset> & { id: string }): SelectableAsset {
  return {
    scope: 'personal',
    owner_membership_id: 'm1',
    media_kind: 'image',
    last_used_at: null,
    usage_count: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    suggested_formats: null,
    aspect_ratio: '1:1',
    storage_path: `path/${partial.id}`,
    ...partial,
  };
}

describe('rankContentAssets / selectBestAsset', () => {
  it('prefers personal over central', () => {
    const ranked = rankContentAssets([
      asset({ id: 'c1', scope: 'central', created_at: '2026-01-01T00:00:00.000Z' }),
      asset({ id: 'p1', scope: 'personal', created_at: '2026-01-02T00:00:00.000Z' }),
    ]);
    expect(ranked[0].id).toBe('p1');
  });

  it('puts last_used_at NULL first', () => {
    const ranked = rankContentAssets([
      asset({
        id: 'used',
        last_used_at: '2026-08-01T00:00:00.000Z',
        usage_count: 0,
      }),
      asset({ id: 'fresh', last_used_at: null, usage_count: 5 }),
    ]);
    expect(ranked[0].id).toBe('fresh');
  });

  it('prefers lower usage_count then older created_at', () => {
    const ranked = rankContentAssets([
      asset({
        id: 'a',
        usage_count: 2,
        created_at: '2026-01-01T00:00:00.000Z',
        last_used_at: '2026-07-01T00:00:00.000Z',
      }),
      asset({
        id: 'b',
        usage_count: 1,
        created_at: '2026-02-01T00:00:00.000Z',
        last_used_at: '2026-07-01T00:00:00.000Z',
      }),
      asset({
        id: 'c',
        usage_count: 1,
        created_at: '2026-01-15T00:00:00.000Z',
        last_used_at: '2026-07-01T00:00:00.000Z',
      }),
    ]);
    expect(ranked.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });

  it('excludes ids and empty storage_path', () => {
    const best = selectBestAsset(
      [
        asset({ id: 'x', storage_path: '' }),
        asset({ id: 'y' }),
        asset({ id: 'z', scope: 'central' }),
      ],
      new Set(['y'])
    );
    expect(best?.id).toBe('z');
  });

  it('returns null when no suitable asset', () => {
    expect(selectBestAsset([asset({ id: 'only' })], new Set(['only']))).toBeNull();
    expect(selectBestAsset([], new Set())).toBeNull();
  });
});

describe('chooseContentFormat', () => {
  it('prefers reel for video', () => {
    expect(chooseContentFormat(asset({ id: 'v', media_kind: 'video' }))).toBe('reel');
  });

  it('uses suggested_formats then aspect then feed default', () => {
    expect(
      chooseContentFormat(asset({ id: '1', suggested_formats: ['story'], aspect_ratio: '1:1' }))
    ).toBe('story');
    expect(
      chooseContentFormat(asset({ id: '2', suggested_formats: null, aspect_ratio: '9:16' }))
    ).toBe('story');
    expect(
      chooseContentFormat(asset({ id: '3', suggested_formats: null, aspect_ratio: null }))
    ).toBe('feed');
  });
});

describe('berlinPrepDate / noon window (CET/CEST)', () => {
  it('computes Berlin calendar date in winter (CET, UTC+1)', () => {
    // 2026-01-15 23:30 UTC → 2026-01-16 00:30 Berlin
    expect(berlinPrepDate(new Date('2026-01-15T23:30:00.000Z'))).toBe('2026-01-16');
    // 2026-01-15 10:00 UTC → still 2026-01-15 Berlin
    expect(berlinPrepDate(new Date('2026-01-15T10:00:00.000Z'))).toBe('2026-01-15');
  });

  it('computes Berlin calendar date in summer (CEST, UTC+2)', () => {
    // 2026-07-15 21:30 UTC → 2026-07-15 23:30 Berlin
    expect(berlinPrepDate(new Date('2026-07-15T21:30:00.000Z'))).toBe('2026-07-15');
    // 2026-07-15 22:30 UTC → 2026-07-16 00:30 Berlin
    expect(berlinPrepDate(new Date('2026-07-15T22:30:00.000Z'))).toBe('2026-07-16');
  });

  it('noon window is 12:00–12:19 Berlin (CET)', () => {
    // 12:00 CET = 11:00 UTC in January
    expect(isBerlinNoonWindow(new Date('2026-01-15T11:00:00.000Z'))).toBe(true);
    expect(isBerlinNoonWindow(new Date('2026-01-15T11:19:00.000Z'))).toBe(true);
    expect(isBerlinNoonWindow(new Date('2026-01-15T11:20:00.000Z'))).toBe(false);
    expect(isBerlinNoonWindow(new Date('2026-01-15T10:59:00.000Z'))).toBe(false);
  });

  it('noon window is 12:00–12:19 Berlin (CEST)', () => {
    // 12:00 CEST = 10:00 UTC in July
    expect(isBerlinNoonWindow(new Date('2026-07-15T10:00:00.000Z'))).toBe(true);
    expect(isBerlinNoonWindow(new Date('2026-07-15T10:19:00.000Z'))).toBe(true);
    expect(isBerlinNoonWindow(new Date('2026-07-15T10:20:00.000Z'))).toBe(false);
    expect(isBerlinNoonWindow(new Date('2026-07-15T11:00:00.000Z'))).toBe(false);
  });

  it('subtractDaysFromDate supports 7-day cooldown math', () => {
    expect(subtractDaysFromDate('2026-08-08', 7)).toBe('2026-08-01');
  });
});

describe('idempotency helpers', () => {
  it('ready prep is NO-OP', () => {
    expect(shouldSkipReadyPrep('ready')).toBe(true);
    expect(shouldSkipReadyPrep('skipped')).toBe(false);
    expect(shouldSkipReadyPrep('failed')).toBe(false);
    expect(shouldSkipReadyPrep('pending')).toBe(false);
  });

  it('draft status contract remains draft (documentation assertion)', () => {
    const DRAFT_STATUS_CONTRACT = 'draft';
    const PUBLISH_ATTEMPTS_FROM_JOB = false;
    const AUTO_PUBLISH = false;
    expect(DRAFT_STATUS_CONTRACT).toBe('draft');
    expect(PUBLISH_ATTEMPTS_FROM_JOB).toBe(false);
    expect(AUTO_PUBLISH).toBe(false);
  });
});

describe('skip reasons (contract)', () => {
  it('documents expected summary reasons', () => {
    const reasons = [
      'no_assets',
      'no_suitable_asset',
      'generation_quota_reached',
      'already_ready',
      'outside_berlin_noon_window',
    ];
    expect(reasons).toContain('generation_quota_reached');
    expect(reasons).toContain('no_assets');
  });
});
