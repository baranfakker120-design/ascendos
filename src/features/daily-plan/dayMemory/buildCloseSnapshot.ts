import type { DailyPlanItem } from '@shared/types/domain';
import type {
  DayCloseEvidenceRef,
  DayCloseJournal,
  DayCloseOutcome,
  DayCloseRecord,
  DayCloseSource,
  DayOpenRecord,
} from './types';

/**
 * Highest-impact open (or first by position) mission — provisional day priority
 * until One-Tap Day lets the user pick explicitly.
 */
export function pickPriorityMission(items: DailyPlanItem[]): DailyPlanItem | null {
  if (items.length === 0) return null;
  const open = items
    .filter((i) => i.status === 'pending' || i.status === 'deferred')
    .sort((a, b) => b.score - a.score || a.position - b.position);
  if (open[0]) return open[0];
  return [...items].sort((a, b) => a.position - b.position)[0] ?? null;
}

export function collectCloseEvidence(items: DailyPlanItem[]): DayCloseEvidenceRef[] {
  return items
    .filter((i) => i.status === 'done')
    .map((i) => ({
      kind: 'mission_done' as const,
      itemId: i.id,
      title: i.title,
      missionType: i.mission_type,
      resolvedAt: i.resolved_at,
      contactId: i.contact_id,
    }));
}

/**
 * "Erledigt" requires proof: the priority mission is done, or — if no priority id —
 * at least one completed mission exists for the day.
 * Never invent completion.
 */
export function canClaimDone(
  items: DailyPlanItem[],
  priorityItemId: string | null | undefined
): boolean {
  const evidence = collectCloseEvidence(items);
  if (evidence.length === 0) return false;
  if (!priorityItemId) return true;
  return evidence.some((e) => e.itemId === priorityItemId);
}

export function resolveJournalOutcome(
  requested: DayCloseOutcome,
  items: DailyPlanItem[],
  priorityItemId: string | null | undefined
): DayCloseOutcome {
  if (requested === 'done' && !canClaimDone(items, priorityItemId)) {
    return items.some((i) => i.status === 'done') ? 'partial' : 'missed';
  }
  return requested;
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

export function buildTomorrowSeed(items: DailyPlanItem[], tomorrowNote?: string | null): string[] {
  const note = tomorrowNote?.trim();
  const carry = items
    .filter((i) => i.status === 'pending' || i.status === 'deferred' || i.status === 'skipped')
    .sort((a, b) => a.position - b.position)
    .map((i) => i.title);
  const seed = note ? [note, ...carry] : carry;
  return [...new Set(seed)].slice(0, 5);
}

export function buildCloseSnapshot(input: {
  userId: string;
  planDate: string;
  items: DailyPlanItem[];
  source: DayCloseSource;
  open?: DayOpenRecord | null;
  journal: DayCloseJournal;
  now?: Date;
}): DayCloseRecord {
  const now = input.now ?? new Date();
  const priority =
    (input.open?.priorityItemId
      ? input.items.find((i) => i.id === input.open!.priorityItemId)
      : null) ?? pickPriorityMission(input.items);

  const priorityItemId = input.open?.priorityItemId ?? priority?.id ?? null;
  const evidence = collectCloseEvidence(input.items);
  const outcome = resolveJournalOutcome(input.journal.outcome, input.items, priorityItemId);

  const done = input.items.filter((i) => i.status === 'done');
  const skipped = input.items.filter((i) => i.status === 'skipped');
  const deferred = input.items.filter((i) => i.status === 'deferred');
  const pending = input.items.filter((i) => i.status === 'pending');
  const reason = input.journal.reason?.trim() || null;
  const tomorrowNote = input.journal.tomorrowNote?.trim() || null;

  return {
    version: 2,
    userId: input.userId,
    planDate: input.planDate,
    closedAt: now.toISOString(),
    outcome,
    priorityWasMain: input.journal.priorityWasMain,
    priorityItemId,
    priorityTitle: input.open?.priorityTitle ?? priority?.title ?? null,
    priorityMissionType: input.open?.priorityMissionType ?? priority?.mission_type ?? null,
    reason,
    tomorrowNote,
    evidence,
    missionsDone: done.length,
    missionsTotal: input.items.length,
    missionsSkipped: skipped.length,
    missionsDeferred: deferred.length,
    openTitles: [...pending, ...deferred].map((i) => i.title).slice(0, 8),
    tomorrowSeed: buildTomorrowSeed(input.items, tomorrowNote),
    source: input.source,
  };
}

export function buildOpenSnapshot(input: {
  userId: string;
  planDate: string;
  items: DailyPlanItem[];
  priority?: DailyPlanItem | null;
  now?: Date;
}): DayOpenRecord {
  const priority = input.priority ?? pickPriorityMission(input.items);
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

/** Evening window for calm close reminder (local clock). */
export function isEveningCloseWindow(now = new Date()): boolean {
  return now.getHours() >= 17;
}
