/**
 * Client mirror of Autopilot week planner (unit-tested).
 * Source: supabase/functions/_shared/content-autopilot/planner.ts
 *
 * Feed = exactly 1 image. Stories = Safe-Reject format intelligence only.
 */

import {
  countEligibleStoryAssets,
  isEligibleAutopilotFeedAsset,
  isEligibleAutopilotStoryAsset,
  type AutopilotEligibleAsset as EligibilityAsset,
} from './eligibility';
import { buildAssetNotCompatibleDetail, buildInsufficientStoryAssetsDetail } from './formatAspect';
import {
  selectBestAutopilotAsset,
  type SelectionAsset,
  type SelectionHistoryItem,
  type WeekdayIndex,
} from './selection';
import { feedTimesForCount, storyTimesForCount } from './timing';

export type PlannerAsset = EligibilityAsset &
  SelectionAsset & {
    theme?: string | null;
    keywords?: string[] | null;
    last_used_at?: string | null;
    usage_count?: number;
    created_at?: string;
  };

export type PlannedSlotDraft = {
  slotKind: 'feed' | 'story';
  hm: string;
  assetId: string;
  carouselAssetIds: string[];
  status: 'planned' | 'skipped';
  skipReason?: string;
  skipDetail?: Record<string, unknown>;
  selectionReason: string;
};

function toSelectionAsset(a: PlannerAsset): SelectionAsset {
  return {
    id: a.id,
    scope: a.scope,
    media_kind: a.media_kind,
    mime_type: a.mime_type,
    storage_path: a.storage_path,
    analysis_status: a.analysis_status,
    theme: a.theme ?? null,
    keywords: a.keywords ?? null,
    suggested_formats: a.suggested_formats ?? null,
    aspect_ratio: a.aspect_ratio,
    width_px: a.width_px,
    height_px: a.height_px,
    last_used_at: a.last_used_at ?? null,
    usage_count: a.usage_count ?? 0,
  };
}

/**
 * Plan one day of slots (testable mirror of edge day loop).
 * Quality over quantity: never force unsafe story/feed crops.
 */
export function buildAutopilotDayPlan(params: {
  assets: readonly PlannerAsset[];
  maxFeedPerDay: number;
  maxStoriesPerDay: number;
  weekday?: WeekdayIndex;
  nowIso?: string;
}): PlannedSlotDraft[] {
  const weekday = params.weekday ?? 2;
  const nowIso = params.nowIso ?? '2026-08-11T06:00:00.000Z';
  const reserved = new Set<string>();
  const history: SelectionHistoryItem[] = [];
  const selectionAssets = params.assets.map(toSelectionAsset);
  const eligibleStoryTotal = countEligibleStoryAssets(params.assets);
  const slots: PlannedSlotDraft[] = [];

  const times: Array<{ kind: 'feed' | 'story'; hm: string }> = [
    ...storyTimesForCount(params.maxStoriesPerDay).map((hm) => ({
      kind: 'story' as const,
      hm,
    })),
    ...feedTimesForCount(params.maxFeedPerDay).map((hm) => ({ kind: 'feed' as const, hm })),
  ];

  for (const t of times) {
    const hour = Number(t.hm.slice(0, 2));
    if (t.kind === 'feed') {
      const best = selectBestAutopilotAsset({
        assets: selectionAssets,
        slotKind: 'feed',
        weekday,
        hour,
        nowIso,
        reservedAssetIds: reserved,
        history,
      });
      if (!best) {
        const leftover = params.assets.find((a) => !reserved.has(a.id));
        if (leftover && !isEligibleAutopilotFeedAsset(leftover)) {
          const detail = buildAssetNotCompatibleDetail({
            slotKind: 'feed',
            aspectRatio: leftover.aspect_ratio,
            suggestedFormats: leftover.suggested_formats,
            widthPx: leftover.width_px,
            heightPx: leftover.height_px,
          });
          slots.push({
            slotKind: 'feed',
            hm: t.hm,
            assetId: '',
            carouselAssetIds: [],
            status: 'skipped',
            skipReason: 'asset_not_compatible',
            skipDetail: detail,
            selectionReason: detail.reason,
          });
        } else {
          slots.push({
            slotKind: 'feed',
            hm: t.hm,
            assetId: '',
            carouselAssetIds: [],
            status: 'skipped',
            skipReason: 'no_suitable_asset',
            selectionReason: 'no_suitable_asset',
          });
        }
        continue;
      }
      reserved.add(best.asset.id);
      history.push({
        assetId: best.asset.id,
        category: best.category,
        publishedAt: nowIso,
      });
      slots.push({
        slotKind: 'feed',
        hm: t.hm,
        assetId: best.asset.id,
        carouselAssetIds: [],
        status: 'planned',
        selectionReason: best.reasons.slice(0, 3).join(' '),
      });
      continue;
    }

    const best = selectBestAutopilotAsset({
      assets: selectionAssets,
      slotKind: 'story',
      weekday,
      hour,
      nowIso,
      reservedAssetIds: reserved,
      history,
    });
    if (!best) {
      const remaining = params.assets.filter(
        (a) => !reserved.has(a.id) && isEligibleAutopilotStoryAsset(a)
      ).length;
      if (eligibleStoryTotal < params.maxStoriesPerDay || remaining === 0) {
        const detail = buildInsufficientStoryAssetsDetail({
          requested: params.maxStoriesPerDay,
          eligible: eligibleStoryTotal,
        });
        slots.push({
          slotKind: 'story',
          hm: t.hm,
          assetId: '',
          carouselAssetIds: [],
          status: 'skipped',
          skipReason: 'insufficient_story_assets',
          skipDetail: detail,
          selectionReason: detail.reason,
        });
      } else {
        const leftover = params.assets.find((a) => !reserved.has(a.id));
        const detail = buildAssetNotCompatibleDetail({
          slotKind: 'story',
          aspectRatio: leftover?.aspect_ratio,
          suggestedFormats: leftover?.suggested_formats,
          widthPx: leftover?.width_px,
          heightPx: leftover?.height_px,
        });
        slots.push({
          slotKind: 'story',
          hm: t.hm,
          assetId: '',
          carouselAssetIds: [],
          status: 'skipped',
          skipReason: 'asset_not_compatible',
          skipDetail: detail,
          selectionReason: detail.reason,
        });
      }
      continue;
    }
    reserved.add(best.asset.id);
    history.push({
      assetId: best.asset.id,
      category: best.category,
      publishedAt: nowIso,
    });
    slots.push({
      slotKind: 'story',
      hm: t.hm,
      assetId: best.asset.id,
      carouselAssetIds: [],
      status: 'planned',
      selectionReason: best.reasons.slice(0, 3).join(' '),
    });
  }

  return slots;
}
