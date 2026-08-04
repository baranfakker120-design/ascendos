import { idbGet, idbSet } from '@shared/offline/idb';
import type { DayCloseRecord, DayOpenRecord } from './types';

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

export async function readDayOpen(
  userId: string,
  planDate: string
): Promise<DayOpenRecord | null> {
  const row = await idbGet<DayOpenRecord>(openKey(userId, planDate));
  return row?.version === 1 ? row : null;
}

export async function writeDayOpen(record: DayOpenRecord): Promise<void> {
  await idbSet(openKey(record.userId, record.planDate), record);
}

export async function readDayClose(
  userId: string,
  planDate: string
): Promise<DayCloseRecord | null> {
  const row = await idbGet<DayCloseRecord>(closeKey(userId, planDate));
  return row?.version === 1 ? row : null;
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
