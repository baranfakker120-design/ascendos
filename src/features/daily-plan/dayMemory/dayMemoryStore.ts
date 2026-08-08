import { idbGet, idbSet } from '@shared/offline/idb';
import type { DayCloseRecord, DayCloseRecordV1, DayOpenRecord } from './types';

const OPEN_PREFIX = 'ascendos.day-memory.open.v1';
const CLOSE_PREFIX = 'ascendos.day-memory.close.v1';

function openKey(userId: string, planDate: string): string {
  return `${OPEN_PREFIX}:${userId}:${planDate}`;
}

function closeKey(userId: string, planDate: string): string {
  return `${CLOSE_PREFIX}:${userId}:${planDate}`;
}

/** Shift YYYY-MM-DD by delta days in local calendar sense (sv-SE). */
export function shiftPlanDate(planDate: string, deltaDays: number): string {
  const [y, m, d] = planDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return dt.toLocaleDateString('sv-SE');
}

export async function readDayOpen(userId: string, planDate: string): Promise<DayOpenRecord | null> {
  const row = await idbGet<DayOpenRecord>(openKey(userId, planDate));
  return row?.version === 1 ? row : null;
}

export async function writeDayOpen(record: DayOpenRecord): Promise<void> {
  await idbSet(openKey(record.userId, record.planDate), record);
}

/** Normalize v1 close records so Decision Diff / Closed Day keep working. */
export function normalizeDayClose(
  row: DayCloseRecord | DayCloseRecordV1 | null | undefined
): DayCloseRecord | null {
  if (!row) return null;
  if (row.version === 2) return row;
  if (row.version === 1) {
    return {
      version: 2,
      userId: row.userId,
      planDate: row.planDate,
      closedAt: row.closedAt,
      outcome: row.outcome,
      priorityWasMain: true,
      priorityItemId: row.priorityItemId,
      priorityTitle: row.priorityTitle,
      priorityMissionType: row.priorityMissionType,
      reason: null,
      tomorrowNote: null,
      evidence: [],
      missionsDone: row.missionsDone,
      missionsTotal: row.missionsTotal,
      missionsSkipped: row.missionsSkipped,
      missionsDeferred: row.missionsDeferred,
      openTitles: row.openTitles,
      tomorrowSeed: row.tomorrowSeed,
      source: row.source,
    };
  }
  return null;
}

export async function readDayClose(
  userId: string,
  planDate: string
): Promise<DayCloseRecord | null> {
  const row = await idbGet<DayCloseRecord | DayCloseRecordV1>(closeKey(userId, planDate));
  return normalizeDayClose(row);
}

export async function writeDayClose(record: DayCloseRecord): Promise<void> {
  await idbSet(closeKey(record.userId, record.planDate), record);
}

export async function readYesterdayClose(
  userId: string,
  todayPlanDate: string
): Promise<DayCloseRecord | null> {
  return readDayClose(userId, shiftPlanDate(todayPlanDate, -1));
}
