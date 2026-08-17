import {
  AUTOPILOT_MAX_FEED_PER_DAY,
  AUTOPILOT_MAX_STORIES_PER_DAY,
  type AutopilotContentFormat,
  type AutopilotEligibleAsset,
  type AutopilotHistoryItem,
  type AutopilotSlotKind,
} from './types.ts';
import { selectAutopilotFeedBundle } from './carouselBundle.ts';
import { countEligibleStoryAssets, isEligibleAutopilotFeedAsset } from './eligibility.ts';
import {
  buildAssetNotCompatibleDetail,
  buildInsufficientStoryAssetsDetail,
} from './formatAspect.ts';
import { selectBestAutopilotAsset } from './selection.ts';
import {
  berlinUtcOffsetHours,
  enumerateDatesInclusive,
  feedTimesForCount,
  parseHm,
  storyTimesForCount,
  wallTimeToIso,
  weekdayIndexFromYmd,
} from './timing.ts';

export interface PlannedSlotDraft {
  plannedFor: string;
  slotKind: AutopilotSlotKind;
  contentFormat: AutopilotContentFormat;
  assetId: string;
  /** Always empty — Autopilot feed never carries carousel children. */
  carouselAssetIds: string[];
  theme: string | null;
  category: string;
  selectionReason: string;
  status: 'planned' | 'skipped';
  skipReason?: string;
  /** Structured skip payload (insufficient_story_assets / asset_not_compatible). */
  skipDetail?: Record<string, unknown>;
}

/** Autopilot V2: feed is always image feed; story is always story (image or video). Never reel. */
export function resolveAutopilotFormat(
  slotKind: AutopilotSlotKind,
  _asset?: AutopilotEligibleAsset
): AutopilotContentFormat {
  return slotKind === 'story' ? 'story' : 'feed';
}

function explainFeedSkip(
  assets: readonly AutopilotEligibleAsset[],
  reserved: ReadonlySet<string>
): { skipReason: string; skipDetail?: Record<string, unknown>; selectionReason: string } {
  const leftover = assets.filter((a) => !reserved.has(a.id));
  const incompatible = leftover.find((a) => !isEligibleAutopilotFeedAsset(a) && a.media_kind === 'image');
  if (incompatible) {
    const detail = buildAssetNotCompatibleDetail({
      slotKind: 'feed',
      aspectRatio: incompatible.aspect_ratio,
      suggestedFormats: incompatible.suggested_formats,
      widthPx: incompatible.width_px,
      heightPx: incompatible.height_px,
    });
    return {
      skipReason: 'asset_not_compatible',
      skipDetail: detail,
      selectionReason: `asset_not_compatible: ${detail.reason} (source=${detail.source_ratio ?? 'unknown'} → ${detail.target_ratio})`,
    };
  }
  return {
    skipReason: 'no_suitable_asset',
    selectionReason: 'Kein ausreichend neuer und geeigneter Feed-Content verfügbar.',
  };
}

function explainStorySkip(params: {
  assets: readonly AutopilotEligibleAsset[];
  reserved: ReadonlySet<string>;
  requestedStoriesPerDay: number;
  eligibleStoryTotal: number;
}): { skipReason: string; skipDetail?: Record<string, unknown>; selectionReason: string } {
  const remainingEligible = params.assets.filter(
    (a) => !params.reserved.has(a.id) && countEligibleStoryAssets([a]) === 1
  ).length;

  if (
    params.eligibleStoryTotal < params.requestedStoriesPerDay ||
    remainingEligible === 0
  ) {
    const detail = buildInsufficientStoryAssetsDetail({
      requested: params.requestedStoriesPerDay,
      eligible: params.eligibleStoryTotal,
    });
    return {
      skipReason: 'insufficient_story_assets',
      skipDetail: detail,
      selectionReason: `insufficient_story_assets: requested=${detail.requested} eligible=${detail.eligible} target=${detail.target}`,
    };
  }

  const leftover = params.assets.find((a) => !params.reserved.has(a.id));
  if (leftover) {
    const detail = buildAssetNotCompatibleDetail({
      slotKind: 'story',
      aspectRatio: leftover.aspect_ratio,
      suggestedFormats: leftover.suggested_formats,
      widthPx: leftover.width_px,
      heightPx: leftover.height_px,
    });
    return {
      skipReason: 'asset_not_compatible',
      skipDetail: detail,
      selectionReason: `asset_not_compatible: ${detail.reason} (source=${detail.source_ratio ?? 'unknown'} → ${detail.target_ratio})`,
    };
  }

  return {
    skipReason: 'no_suitable_asset',
    selectionReason: 'Kein ausreichend neuer und geeigneter Story-Content verfügbar.',
  };
}

/**
 * Build a week of slots.
 * Feed: ALWAYS exactly 1 image (never carousel). Never reel.
 * Stories: image or video story — only Safe-Reject-compatible assets.
 * Caps come from publishing mode (stories/feed/full/marked_stories).
 */
export function buildAutopilotWeekPlan(params: {
  periodStart: string;
  periodEnd: string;
  assets: readonly AutopilotEligibleAsset[];
  history: readonly AutopilotHistoryItem[];
  nowIso?: string;
  maxFeedPerDay?: number;
  maxStoriesPerDay?: number;
}): PlannedSlotDraft[] {
  const nowIso = params.nowIso ?? new Date().toISOString();
  const maxFeed = Math.min(
    AUTOPILOT_MAX_FEED_PER_DAY,
    Math.max(0, params.maxFeedPerDay ?? AUTOPILOT_MAX_FEED_PER_DAY)
  );
  const maxStories = Math.min(
    AUTOPILOT_MAX_STORIES_PER_DAY,
    Math.max(0, params.maxStoriesPerDay ?? 0)
  );
  const reserved = new Set<string>();
  const history = [...params.history];
  const slots: PlannedSlotDraft[] = [];
  const eligibleStoryTotal = countEligibleStoryAssets(params.assets);

  for (const dateYmd of enumerateDatesInclusive(params.periodStart, params.periodEnd)) {
    const offset = berlinUtcOffsetHours(dateYmd);
    const weekday = weekdayIndexFromYmd(dateYmd);

    const feedTimes = feedTimesForCount(maxFeed);
    const storyTimes = storyTimesForCount(maxStories);

    const daySlots: Array<{ kind: AutopilotSlotKind; hm: string }> = [
      ...storyTimes.map((hm) => ({ kind: 'story' as const, hm })),
      ...feedTimes.map((hm) => ({ kind: 'feed' as const, hm })),
    ];

    for (const { kind, hm } of daySlots) {
      const { hour } = parseHm(hm);
      const plannedFor = wallTimeToIso({ dateYmd, hm, utcOffsetHours: offset });
      // Skip past slots when activating mid-week
      if (new Date(plannedFor).getTime() < new Date(nowIso).getTime() - 60_000) {
        continue;
      }

      if (kind === 'feed') {
        const bundle = selectAutopilotFeedBundle({
          assets: params.assets,
          weekday,
          hour,
          nowIso: plannedFor,
          reservedAssetIds: reserved,
          history,
        });

        if (!bundle) {
          const explained = explainFeedSkip(params.assets, reserved);
          slots.push({
            plannedFor,
            slotKind: kind,
            contentFormat: 'feed',
            assetId: '',
            carouselAssetIds: [],
            theme: null,
            category: 'none',
            selectionReason: explained.selectionReason,
            status: 'skipped',
            skipReason: explained.skipReason,
            skipDetail: explained.skipDetail,
          });
          continue;
        }

        for (const a of bundle.assets) {
          reserved.add(a.id);
          history.push({
            assetId: a.id,
            category: bundle.category,
            theme: a.theme,
            publishedAt: plannedFor,
            slotKind: kind,
          });
        }

        slots.push({
          plannedFor,
          slotKind: kind,
          contentFormat: 'feed',
          assetId: bundle.primary.id,
          // Hard block: Autopilot feed never carries carousel children.
          carouselAssetIds: [],
          theme: bundle.primary.theme,
          category: bundle.category,
          selectionReason: bundle.reasons.slice(0, 3).join(' ') || 'Beste Passung für diesen Slot.',
          status: 'planned',
        });
        continue;
      }

      // Story — image or video story (never reel); never force unsafe crops.
      const best = selectBestAutopilotAsset({
        assets: params.assets,
        slotKind: kind,
        weekday,
        hour,
        nowIso: plannedFor,
        reservedAssetIds: reserved,
        history,
      });

      if (!best) {
        const explained = explainStorySkip({
          assets: params.assets,
          reserved,
          requestedStoriesPerDay: maxStories,
          eligibleStoryTotal,
        });
        slots.push({
          plannedFor,
          slotKind: kind,
          contentFormat: 'story',
          assetId: '',
          carouselAssetIds: [],
          theme: null,
          category: 'none',
          selectionReason: explained.selectionReason,
          status: 'skipped',
          skipReason: explained.skipReason,
          skipDetail: explained.skipDetail,
        });
        continue;
      }

      reserved.add(best.asset.id);
      history.push({
        assetId: best.asset.id,
        category: best.category,
        theme: best.asset.theme,
        publishedAt: plannedFor,
        slotKind: kind,
      });

      slots.push({
        plannedFor,
        slotKind: kind,
        contentFormat: 'story',
        assetId: best.asset.id,
        carouselAssetIds: [],
        theme: best.asset.theme,
        category: best.category,
        selectionReason: best.reasons.slice(0, 3).join(' ') || 'Beste Passung für diesen Slot.',
        status: 'planned',
      });
    }
  }

  return slots;
}
