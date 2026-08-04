/**
 * Sprint 5 · Closing Loop — Day Memory contracts.
 * Local durable day truth. No new DB tables / RPCs.
 */

export type DayCloseOutcome = 'done' | 'partial' | 'missed';

export type DayCloseSource = 'missions_complete' | 'manual_close' | 'evening_reminder';

export interface DayCloseEvidenceRef {
  kind: 'mission_done';
  itemId: string;
  title: string;
  missionType: string;
  resolvedAt: string | null;
  contactId: string | null;
}

/** User answers from the Closing Loop journal. */
export interface DayCloseJournal {
  /** Step 1 — was the shown priority today’s most important task? */
  priorityWasMain: boolean;
  /** Step 2 — status (done only allowed with evidence). */
  outcome: DayCloseOutcome;
  /** Step 3 — optional reason. */
  reason: string | null;
  /** Step 4 — optional tomorrow note. */
  tomorrowNote: string | null;
}

export interface DayCloseRecord {
  version: 2;
  userId: string;
  planDate: string;
  /** Created / closed timestamp. */
  closedAt: string;
  outcome: DayCloseOutcome;
  priorityWasMain: boolean;
  priorityItemId: string | null;
  priorityTitle: string | null;
  priorityMissionType: string | null;
  reason: string | null;
  tomorrowNote: string | null;
  evidence: DayCloseEvidenceRef[];
  missionsDone: number;
  missionsTotal: number;
  missionsSkipped: number;
  missionsDeferred: number;
  /** Unfinished carry-over titles. */
  openTitles: string[];
  /** Seed for tomorrow’s Decision Diff (note + carry-over). */
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

/** Legacy v1 close records still readable for yesterday Diff. */
export interface DayCloseRecordV1 {
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
  openTitles: string[];
  tomorrowSeed: string[];
  source: DayCloseSource;
}
