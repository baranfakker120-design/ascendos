/**
 * Sprint 5 · Day Memory — Closing Loop contracts.
 * Local durable day truth for Decision Diff (L2). No new DB tables.
 */

export type DayCloseOutcome = 'done' | 'partial' | 'missed';

export type DayCloseSource = 'missions_complete' | 'manual_close';

export interface DayCloseRecord {
  version: 1;
  userId: string;
  planDate: string;
  closedAt: string;
  outcome: DayCloseOutcome;
  priorityItemId: string | null;
  priorityTitle: string | null;
  priorityMissionType: string | null;
  missionsDone: number;
  missionsTotal: number;
  missionsSkipped: number;
  missionsDeferred: number;
  /** Titles still open or skipped — feed tomorrow’s Decision Diff. */
  openTitles: string[];
  tomorrowSeed: string[];
  source: DayCloseSource;
}

export interface DayOpenRecord {
  version: 1;
  userId: string;
  planDate: string;
  openedAt: string;
  priorityItemId: string | null;
  priorityTitle: string | null;
  priorityMissionType: string | null;
}
