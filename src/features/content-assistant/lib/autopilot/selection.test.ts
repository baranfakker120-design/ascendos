import { describe, expect, it } from 'vitest';
import { canActivateAutopilot } from './eligibility';
import {
  inferCategoryFromAsset,
  scoreAutopilotCandidate,
  selectBestAutopilotAsset,
  type SelectionAsset,
} from './selection';

function asset(partial: Partial<SelectionAsset> & { id: string }): SelectionAsset {
  return {
    scope: 'personal',
    media_kind: 'image',
    mime_type: 'image/jpeg',
    storage_path: `org/u/${partial.id}/original.jpg`,
    analysis_status: 'ready',
    theme: null,
    keywords: null,
    suggested_formats: ['feed', 'story'],
    last_used_at: null,
    usage_count: 0,
    ...partial,
  };
}

const now = '2026-08-11T12:00:00.000Z'; // Tuesday midday-ish UTC
const baseParams = {
  slotKind: 'feed' as const,
  weekday: 2 as const, // Tuesday → education preferred
  hour: 13,
  nowIso: now,
  reservedAssetIds: new Set<string>(),
  history: [] as Array<{ assetId: string | null; category: string | null; publishedAt: string }>,
};

describe('autopilot selection — score / category / usage / format', () => {
  it('infers category from theme/keywords', () => {
    expect(
      inferCategoryFromAsset({ theme: 'Recruiting Reel', keywords: [], suggestedFormats: [] })
    ).toBe('recruiting');
    expect(
      inferCategoryFromAsset({
        theme: 'Parfum Produktfoto',
        keywords: ['duft'],
        suggestedFormats: [],
      })
    ).toBe('product');
    expect(inferCategoryFromAsset({ theme: null, keywords: null, suggestedFormats: null })).toBe(
      'general'
    );
  });

  it('scores unused assets higher than heavily used ones', () => {
    const fresh = scoreAutopilotCandidate({
      ...baseParams,
      asset: asset({ id: 'fresh', usage_count: 0, theme: 'Tipp Education' }),
    });
    const heavy = scoreAutopilotCandidate({
      ...baseParams,
      asset: asset({ id: 'heavy', usage_count: 10, theme: 'Tipp Education' }),
    });
    expect(fresh).not.toBeNull();
    expect(heavy).not.toBeNull();
    expect(fresh!.score).toBeGreaterThan(heavy!.score);
  });

  it('boosts matching suggested format for feed/story', () => {
    const withFeed = scoreAutopilotCandidate({
      ...baseParams,
      slotKind: 'feed',
      asset: asset({ id: 'f1', suggested_formats: ['feed'], aspect_ratio: '1:1' }),
    });
    const weakFeed = scoreAutopilotCandidate({
      ...baseParams,
      slotKind: 'feed',
      asset: asset({
        id: 'f2',
        suggested_formats: ['story'],
        aspect_ratio: '1:1',
      }),
    });
    expect(withFeed).not.toBeNull();
    expect(weakFeed).not.toBeNull();
    expect(withFeed!.score).toBeGreaterThan(weakFeed!.score);
  });

  it('rejects feed candidates that only suggest story without feed aspect', () => {
    const rejected = scoreAutopilotCandidate({
      ...baseParams,
      slotKind: 'feed',
      asset: asset({ id: 'f3', suggested_formats: ['story'] }),
    });
    expect(rejected).toBeNull();
  });

  it('allows video for story scoring but never for feed', () => {
    const videoStory = scoreAutopilotCandidate({
      ...baseParams,
      slotKind: 'story',
      asset: asset({
        id: 'vid',
        media_kind: 'video',
        mime_type: 'video/mp4',
        suggested_formats: ['story'],
      }),
    });
    const videoFeed = scoreAutopilotCandidate({
      ...baseParams,
      slotKind: 'feed',
      asset: asset({
        id: 'vid2',
        media_kind: 'video',
        mime_type: 'video/mp4',
        suggested_formats: ['feed', 'reel'],
      }),
    });
    expect(videoStory).not.toBeNull();
    expect(videoFeed).toBeNull();
  });

  it('selects best scoring asset, not first in list', () => {
    const first = asset({
      id: 'first',
      theme: 'random',
      usage_count: 8,
      last_used_at: '2026-08-10T19:00:00.000Z',
    });
    const best = asset({
      id: 'best',
      theme: 'Education Tipps',
      usage_count: 0,
      suggested_formats: ['feed'],
    });
    const picked = selectBestAutopilotAsset({
      ...baseParams,
      assets: [first, best],
    });
    expect(picked?.asset.id).toBe('best');
  });
});

describe('autopilot selection — no-repeat / reservation', () => {
  it('returns null for reserved assets', () => {
    const scored = scoreAutopilotCandidate({
      ...baseParams,
      asset: asset({ id: 'a1' }),
      reservedAssetIds: new Set(['a1']),
    });
    expect(scored).toBeNull();
  });

  it('strongly downranks assets used yesterday when alternatives exist', () => {
    const usedYesterday = asset({
      id: 'used',
      theme: 'Education',
      last_used_at: '2026-08-10T19:00:00.000Z',
      usage_count: 1,
    });
    const alternative = asset({
      id: 'alt',
      theme: 'Education Tipps',
      usage_count: 0,
    });
    const picked = selectBestAutopilotAsset({
      ...baseParams,
      assets: [usedYesterday, alternative],
      history: [
        { assetId: 'used', category: 'education', publishedAt: '2026-08-10T19:00:00.000Z' },
      ],
    });
    expect(picked?.asset.id).toBe('alt');
  });

  it('skips slot when only recycled low-score assets remain', () => {
    const recycled = asset({
      id: 'r1',
      theme: 'x',
      usage_count: 20,
      last_used_at: now,
    });
    const picked = selectBestAutopilotAsset({
      ...baseParams,
      assets: [recycled],
      history: [{ assetId: 'r1', category: 'general', publishedAt: now }],
      minScore: 35,
    });
    expect(picked).toBeNull();
  });
});

describe('autopilot selection — 10-asset-gate still independent', () => {
  it('gate blocks below 10 even if selection scoring would work', () => {
    const nine = Array.from({ length: 9 }, (_, i) =>
      asset({ id: `p${i}`, scope: i % 2 ? 'central' : 'personal' })
    );
    expect(canActivateAutopilot(nine).ok).toBe(false);
    expect(canActivateAutopilot([...nine, asset({ id: 'p9' })]).ok).toBe(true);
  });
});
