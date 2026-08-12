import {
  AUTOPILOT_MAX_FEED_PER_DAY,
  AUTOPILOT_MAX_STORIES_PER_DAY,
  type AutopilotContentFormat,
  type AutopilotEligibleAsset,
  type AutopilotHistoryItem,
  type AutopilotSlotKind,
} from './types.ts';
import { selectAutopilotFeedBundle } from './carouselBundle.ts';
import { selectBestAutopilotAsset } from './selection.ts';
import {
  berlinUtcOffsetHours,
  DEFAULT_FEED_TIMES,
  DEFAULT_STORY_TIMES,
  enumerateDatesInclusive,
  parseHm,
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
}

/** Autopilot V2: feed is always image feed; story is always story (image or video). Never reel. */
export function resolveAutopilotFormat(
  slotKind: AutopilotSlotKind,
  _asset?: AutopilotEligibleAsset
): AutopilotContentFormat {
  return slotKind === 'story' ? 'story' : 'feed';
}

/**
 * Build a week of slots (max 3 feed + 3 stories / day).
 * Feed: ALWAYS exactly 1 image (never carousel).
 * Stories: image or video story.
 * Never plans reel / video feed / image carousel / video carousel.
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
    params.maxFeedPerDay ?? AUTOPILOT_MAX_FEED_PER_DAY
  );
  const maxStories = Math.min(
    AUTOPILOT_MAX_STORIES_PER_DAY,
    params.maxStoriesPerDay ?? AUTOPILOT_MAX_STORIES_PER_DAY
  );
  const reserved = new Set<string>();
  const history = [...params.history];
  const slots: PlannedSlotDraft[] = [];

  for (const dateYmd of enumerateDatesInclusive(params.periodStart, params.periodEnd)) {
    const offset = berlinUtcOffsetHours(dateYmd);
    const weekday = weekdayIndexFromYmd(dateYmd);

    const feedTimes = DEFAULT_FEED_TIMES.slice(0, maxFeed);
    const storyTimes = DEFAULT_STORY_TIMES.slice(0, maxStories);

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
          slots.push({
            plannedFor,
            slotKind: kind,
            contentFormat: 'feed',
            assetId: '',
            carouselAssetIds: [],
            theme: null,
            category: 'none',
            selectionReason: 'Kein ausreichend neuer und geeigneter Content verfügbar.',
            status: 'skipped',
            skipReason: 'no_suitable_asset',
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

      // Story — image or video story (never reel)
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
        slots.push({
          plannedFor,
          slotKind: kind,
          contentFormat: 'story',
          assetId: '',
          carouselAssetIds: [],
          theme: null,
          category: 'none',
          selectionReason: 'Kein ausreichend neuer und geeigneter Content verfügbar.',
          status: 'skipped',
          skipReason: 'no_suitable_asset',
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
