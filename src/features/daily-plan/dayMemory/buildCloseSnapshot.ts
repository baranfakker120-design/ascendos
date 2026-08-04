import type { DailyPlanItem } from '@shared/types/domain';
import type { DayCloseOutcome, DayCloseRecord, DayCloseSource, DayOpenRecord } from './types';

/**
 * Highest-impact open (or first by position) mission — provisional day priority
 * until One-Tap Day (L3) lets the user pick explicitly.
 */
export function pickPriorityMission(items: DailyPlanItem[]): DailyPlanItem | null {
  if (items.length === 0) return null;
  const open = items
    .filter((i) => i.status === 'pending' || i.status === 'deferred')
    .sort((a, b) => b.score - a.score || a.position - b.position);
  if (open[0]) return open[0];
  return [...items].sort((a, b) => a.position - b.position)[0] ?? null;
}

export function deriveCloseOutcome(items: DailyPlanItem[]): DayCloseOutcome {
  if (items.length === 0) return 'missed';
  const done = items.filter((i) => i.status === 'done').length;
  const open = items.filter((i) => i.status === 'pending' || i.status === 'deferred').length;
  if (open === 0 && done === items.length) return 'done';
  if (open === 0 && done > 0) return 'partial';
  if (done === 0) return 'missed';
  return 'partial';
}

export function buildTomorrowSeed(items: DailyPlanItem[]): string[] {
  const carry = items
    .filter((i) => i.status === 'pending' || i.status === 'deferred' || i.status === 'skipped')
    .sort((a, b) => a.position - b.position)
    .map((i) => i.title);
  // Stable unique, cap for Diff readability
  return [...new Set(carry)].slice(0, 5);
}

export function buildCloseSnapshot(input: {
  userId: string;
  planDate: string;
  items: DailyPlanItem[];
  source: DayCloseSource;
  open?: DayOpenRecord | null;
  now?: Date;
}): DayCloseRecord {
  const now = input.now ?? new Date();
  const priority =
    (input.open?.priorityItemId
      ? input.items.find((i) => i.id === input.open!.priorityItemId)
      : null) ?? pickPriorityMission(input.items);

  const done = input.items.filter((i) => i.status === 'done');
  const skipped = input.items.filter((i) => i.status === 'skipped');
  const deferred = input.items.filter((i) => i.status === 'deferred');
  const pending = input.items.filter((i) => i.status === 'pending');

  return {
    version: 1,
    userId: input.userId,
    planDate: input.planDate,
    closedAt: now.toISOString(),
    outcome: deriveCloseOutcome(input.items),
    priorityItemId: input.open?.priorityItemId ?? priority?.id ?? null,
    priorityTitle: input.open?.priorityTitle ?? priority?.title ?? null,
    priorityMissionType: input.open?.priorityMissionType ?? priority?.mission_type ?? null,
    missionsDone: done.length,
    missionsTotal: input.items.length,
    missionsSkipped: skipped.length,
    missionsDeferred: deferred.length,
    openTitles: [...pending, ...deferred].map((i) => i.title).slice(0, 8),
    tomorrowSeed: buildTomorrowSeed(input.items),
    source: input.source,
  };
}

export function buildOpenSnapshot(input: {
  userId: string;
  planDate: string;
  items: DailyPlanItem[];
  now?: Date;
}): DayOpenRecord {
  const priority = pickPriorityMission(input.items);
  return {
    version: 1,
    userId: input.userId,
    planDate: input.planDate,
    openedAt: (input.now ?? new Date()).toISOString(),
    priorityItemId: priority?.id ?? null,
    priorityTitle: priority?.title ?? null,
    priorityMissionType: priority?.mission_type ?? null,
  };
}
