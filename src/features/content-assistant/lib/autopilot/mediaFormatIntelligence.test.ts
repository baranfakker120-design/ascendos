import { describe, expect, it } from 'vitest';
import {
  AUTOPILOT_ELIGIBLE_ASSET_SELECT,
  AUTOPILOT_STORY_ASPECT,
  aspectFitsAutopilotSlot,
  assessMediaCompatibility,
  buildAssetNotCompatibleDetail,
  buildInsufficientStoryAssetsDetail,
  canvasForAutopilotSlot,
  mediaFormatScoreDelta,
} from './formatAspect';
import {
  AUTOPILOT_FEED_IMAGE_PROCESSOR as FEED_PREP,
  FORBIDDEN_IMAGESCRIPT_REMOTE,
  sourceHasForbiddenImagescriptImport,
} from './feedImagePrepare';
import { isEligibleAutopilotStoryAsset } from './eligibility';
import {
  scoreAutopilotCandidate,
  selectBestAutopilotAsset,
  type SelectionAsset,
} from './selection';
import { buildAutopilotDayPlan } from './planner';

function asset(partial: Partial<SelectionAsset> & { id: string }): SelectionAsset {
  return {
    scope: 'personal',
    media_kind: 'image',
    mime_type: 'image/jpeg',
    storage_path: `org/u/${partial.id}/original.jpg`,
    analysis_status: 'ready',
    theme: 'Education Tipps',
    keywords: ['tipp'],
    suggested_formats: [],
    last_used_at: null,
    usage_count: 0,
    ...partial,
  };
}

const base = {
  weekday: 2 as const,
  hour: 13,
  nowIso: '2026-08-11T12:00:00.000Z',
  reservedAssetIds: new Set<string>(),
  history: [] as Array<{ assetId: string | null; category: string | null; publishedAt: string }>,
};

describe('media format intelligence — story', () => {
  it('1. prefers exact 9:16 story asset', () => {
    const nine = asset({
      id: 's916',
      aspect_ratio: '9:16',
      suggested_formats: ['story'],
      width_px: 1080,
      height_px: 1920,
    });
    const square = asset({
      id: 's11',
      aspect_ratio: '1:1',
      suggested_formats: ['story'],
      width_px: 1080,
      height_px: 1080,
    });
    expect(isEligibleAutopilotStoryAsset(nine)).toBe(true);
    expect(isEligibleAutopilotStoryAsset(square)).toBe(false);
    const picked = selectBestAutopilotAsset({
      ...base,
      slotKind: 'story',
      assets: [square, nine],
    });
    expect(picked?.asset.id).toBe('s916');
  });

  it('2. rejects 1:1 for story', () => {
    expect(aspectFitsAutopilotSlot('story', '1:1', ['story'])).toBe(false);
    expect(
      scoreAutopilotCandidate({
        ...base,
        slotKind: 'story',
        asset: asset({ id: 'x', aspect_ratio: '1:1', suggested_formats: ['story'] }),
      })
    ).toBeNull();
  });

  it('3. rejects 4:5 for story (no unsafe crop)', () => {
    expect(aspectFitsAutopilotSlot('story', '4:5', ['story'])).toBe(false);
    const fit = assessMediaCompatibility({
      slotKind: 'story',
      aspectRatio: '4:5',
      suggestedFormats: ['story'],
      widthPx: 1080,
      heightPx: 1350,
    });
    expect(fit.compatible).toBe(false);
    expect(fit.cropRisk).toBe('high');
  });

  it('4. rejects landscape for story', () => {
    expect(aspectFitsAutopilotSlot('story', '16:9', null)).toBe(false);
    expect(aspectFitsAutopilotSlot('story', 'other', ['story'], 1920, 1080)).toBe(false);
  });
});

describe('media format intelligence — feed', () => {
  it('5. prefers 4:5 over 1:1 for feed', () => {
    const fourFive = asset({
      id: 'f45',
      aspect_ratio: '4:5',
      suggested_formats: ['feed'],
      width_px: 1080,
      height_px: 1350,
    });
    const square = asset({
      id: 'f11',
      aspect_ratio: '1:1',
      suggested_formats: ['feed'],
      width_px: 1080,
      height_px: 1080,
    });
    const s45 = scoreAutopilotCandidate({ ...base, slotKind: 'feed', asset: fourFive });
    const s11 = scoreAutopilotCandidate({ ...base, slotKind: 'feed', asset: square });
    expect(s45!.score).toBeGreaterThan(s11!.score);
    const picked = selectBestAutopilotAsset({
      ...base,
      slotKind: 'feed',
      assets: [square, fourFive],
    });
    expect(picked?.asset.id).toBe('f45');
  });

  it('6. rejects 9:16 for feed', () => {
    expect(aspectFitsAutopilotSlot('feed', '9:16', ['feed'])).toBe(false);
  });

  it('7. rejects 16:9 for feed', () => {
    expect(aspectFitsAutopilotSlot('feed', '16:9', ['feed'])).toBe(false);
  });

  it('8. feed stays exactly 1 image (no carousel ids)', () => {
    const assets = Array.from({ length: 5 }, (_, i) =>
      asset({
        id: `f${i}`,
        aspect_ratio: '4:5',
        suggested_formats: ['feed'],
        width_px: 1080,
        height_px: 1350,
      })
    );
    const plan = buildAutopilotDayPlan({
      assets,
      maxFeedPerDay: 1,
      maxStoriesPerDay: 0,
    });
    const feed = plan.filter((s) => s.slotKind === 'feed' && s.status === 'planned');
    expect(feed).toHaveLength(1);
    expect(feed[0].carouselAssetIds).toEqual([]);
  });
});

describe('media format intelligence — story count quality', () => {
  it('9. 4 story slots with 4 suitable 9:16 assets', () => {
    const assets = Array.from({ length: 4 }, (_, i) =>
      asset({
        id: `st${i}`,
        aspect_ratio: '9:16',
        suggested_formats: ['story'],
        width_px: 1080,
        height_px: 1920,
      })
    );
    const plan = buildAutopilotDayPlan({
      assets,
      maxFeedPerDay: 0,
      maxStoriesPerDay: 4,
    });
    const stories = plan.filter((s) => s.slotKind === 'story');
    expect(stories).toHaveLength(4);
    expect(stories.every((s) => s.status === 'planned')).toBe(true);
    expect(new Set(stories.map((s) => s.assetId)).size).toBe(4);
  });

  it('10. 4 story slots with only 2 suitable → insufficient_story_assets', () => {
    const assets = [
      asset({
        id: 'ok1',
        aspect_ratio: '9:16',
        suggested_formats: ['story'],
        width_px: 1080,
        height_px: 1920,
      }),
      asset({
        id: 'ok2',
        aspect_ratio: '9:16',
        suggested_formats: ['story'],
        width_px: 1080,
        height_px: 1920,
      }),
      asset({
        id: 'bad1',
        aspect_ratio: '1:1',
        suggested_formats: ['story'],
        width_px: 1080,
        height_px: 1080,
      }),
      asset({
        id: 'bad2',
        aspect_ratio: '4:5',
        suggested_formats: ['feed'],
        width_px: 1080,
        height_px: 1350,
      }),
    ];
    const plan = buildAutopilotDayPlan({
      assets,
      maxFeedPerDay: 0,
      maxStoriesPerDay: 4,
    });
    const stories = plan.filter((s) => s.slotKind === 'story');
    expect(stories).toHaveLength(4);
    const planned = stories.filter((s) => s.status === 'planned');
    const skipped = stories.filter((s) => s.status === 'skipped');
    expect(planned).toHaveLength(2);
    expect(skipped).toHaveLength(2);
    expect(skipped.every((s) => s.skipReason === 'insufficient_story_assets')).toBe(true);
    expect(skipped[0].skipDetail).toMatchObject({
      code: 'insufficient_story_assets',
      requested: 4,
      eligible: 2,
      target: AUTOPILOT_STORY_ASPECT,
    });
  });
});

describe('media format intelligence — cron / cost / compat', () => {
  it('11. cron select columns include same metadata as user-activate', () => {
    expect(AUTOPILOT_ELIGIBLE_ASSET_SELECT).toContain('aspect_ratio');
    expect(AUTOPILOT_ELIGIBLE_ASSET_SELECT).toContain('width_px');
    expect(AUTOPILOT_ELIGIBLE_ASSET_SELECT).toContain('height_px');
    expect(AUTOPILOT_ELIGIBLE_ASSET_SELECT).toContain('suggested_formats');
  });

  it('12. no Autopilot crop processor / no ImageScript path', () => {
    expect(FEED_PREP).toBe('passthrough_no_imagescript');
    expect(
      sourceHasForbiddenImagescriptImport(`import { Image } from '${FORBIDDEN_IMAGESCRIPT_REMOTE}'`)
    ).toBe(true);
    expect(sourceHasForbiddenImagescriptImport('export const x = 1')).toBe(false);
  });

  it('13. structured skip reasons + canvas targets stay compatible', () => {
    const detail = buildAssetNotCompatibleDetail({
      slotKind: 'story',
      aspectRatio: '1:1',
      widthPx: 1000,
      heightPx: 1000,
    });
    expect(detail.code).toBe('asset_not_compatible');
    expect(detail.source_ratio).toBe('1:1');
    expect(detail.target_ratio).toBe('9:16');
    expect(detail.crop_risk).toBe('high');
    expect(buildInsufficientStoryAssetsDetail({ requested: 4, eligible: 2 }).code).toBe(
      'insufficient_story_assets'
    );
    expect(canvasForAutopilotSlot('story')).toEqual({
      width: 1080,
      height: 1920,
      aspect: '9:16',
    });
    expect(canvasForAutopilotSlot('feed', '4:5').height).toBe(1350);
  });

  it('14. org pool filter contract — select is metadata-only (no cross-org fields)', () => {
    // loadEligibleAssets always filters .eq('org_id', orgId); select list must not invent joins.
    expect(AUTOPILOT_ELIGIBLE_ASSET_SELECT.includes('org_id')).toBe(false);
    expect(mediaFormatScoreDelta({ slotKind: 'story', aspectRatio: '9:16' }).delta).toBeGreaterThan(
      0
    );
  });
});
