import {
  AUTOPILOT_MAX_FEED_PER_DAY,
  AUTOPILOT_MAX_STORIES_PER_DAY,
  type AutopilotContentFormat,
  type AutopilotEligibleAsset,
  type AutopilotHistoryItem,
  type AutopilotSlotKind,
} from './types.ts';
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
  theme: string | null;
  category: string;
  selectionReason: string;
  status: 'planned' | 'skipped';
  skipReason?: string;
}

function resolveFormat(
  slotKind: AutopilotSlotKind,
  asset: AutopilotEligibleAsset
): AutopilotContentFormat {
  if (slotKind === 'story') return 'story';
  if (asset.media_kind === 'video') return 'reel';
  return 'feed';
}

/**
 * Build a week of slots (max 3 feed + 3 stories / day).
 * Skips slots when no suitable unused asset remains.
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
          contentFormat: kind === 'story' ? 'story' : 'feed',
          assetId: '',
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
        contentFormat: resolveFormat(kind, best.asset),
        assetId: best.asset.id,
        theme: best.asset.theme,
        category: best.category,
        selectionReason: best.reasons.slice(0, 3).join(' ') || 'Beste Passung für diesen Slot.',
        status: 'planned',
      });
    }
  }

  return slots;
}
