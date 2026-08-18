import { describe, expect, it } from 'vitest';
import type { DailyPlanItem } from '@shared/types/domain';
import {
  buildCloseSnapshot,
  buildOpenSnapshot,
  buildTomorrowSeed,
  canClaimDone,
  collectCloseEvidence,
  deriveCloseOutcome,
  isEveningCloseWindow,
  pickPriorityMission,
  resolveJournalOutcome,
} from './buildCloseSnapshot';
import { normalizeDayClose, shiftPlanDate } from './dayMemoryStore';
import type { DayCloseRecordV1 } from './types';

function item(
  partial: Partial<DailyPlanItem> & Pick<DailyPlanItem, 'id' | 'title' | 'status' | 'position'>
): DailyPlanItem {
  return {
    plan_id: 'plan-1',
    contact_id: null,
    mission_type: 'follow_up_overdue',
    reason: 'why',
    score: 10,
    status_reason: null,
    resolved_at: null,
    created_at: '2026-08-04T08:00:00.000Z',
    ...partial,
  };
}

describe('pickPriorityMission', () => {
  it('picks highest score among open missions', () => {
    const items = [
      item({ id: 'a', title: 'A', status: 'pending', position: 1, score: 5 }),
      item({ id: 'b', title: 'B', status: 'deferred', position: 2, score: 40 }),
      item({ id: 'c', title: 'C', status: 'done', position: 0, score: 99 }),
    ];
    expect(pickPriorityMission(items)?.id).toBe('b');
  });
});

describe('evidence gating', () => {
  it('forbids done without mission evidence', () => {
    const items = [item({ id: 'a', title: 'A', status: 'pending', position: 0 })];
    expect(canClaimDone(items, 'a')).toBe(false);
    expect(resolveJournalOutcome('done', items, 'a')).toBe('missed');
  });

  it('allows done only when priority mission is completed', () => {
    const items = [
      item({
        id: 'a',
        title: 'Call Maya',
        status: 'done',
        position: 0,
        resolved_at: '2026-08-04T12:00:00.000Z',
      }),
      item({ id: 'b', title: 'Follow up', status: 'pending', position: 1 }),
    ];
    expect(canClaimDone(items, 'a')).toBe(true);
    expect(canClaimDone(items, 'b')).toBe(false);
    expect(collectCloseEvidence(items)).toHaveLength(1);
    expect(resolveJournalOutcome('done', items, 'b')).toBe('partial');
  });
});

describe('deriveCloseOutcome', () => {
  it('returns done when all missions completed', () => {
    const items = [
      item({ id: 'a', title: 'A', status: 'done', position: 0 }),
      item({ id: 'b', title: 'B', status: 'done', position: 1 }),
    ];
    expect(deriveCloseOutcome(items)).toBe('done');
  });

  it('returns partial when some done and some skipped', () => {
    const items = [
      item({ id: 'a', title: 'A', status: 'done', position: 0 }),
      item({ id: 'b', title: 'B', status: 'skipped', position: 1 }),
    ];
    expect(deriveCloseOutcome(items)).toBe('partial');
  });

  it('returns missed when nothing done and work remains', () => {
    const items = [item({ id: 'a', title: 'A', status: 'pending', position: 0 })];
    expect(deriveCloseOutcome(items)).toBe('missed');
  });
});

describe('buildTomorrowSeed', () => {
  it('puts tomorrow note first, then carry-over', () => {
    const items = [
      item({ id: 'a', title: 'Call Maya', status: 'skipped', position: 0 }),
      item({ id: 'b', title: 'Fit-Check', status: 'deferred', position: 1 }),
    ];
    expect(buildTomorrowSeed(items, '  Call Sam first  ')).toEqual([
      'Call Sam first',
      'Call Maya',
      'Fit-Check',
    ]);
  });
});

describe('buildCloseSnapshot', () => {
  it('persists journal fields and evidence refs', () => {
    const atOpen = [
      item({ id: 'a', title: 'Call Maya', status: 'pending', position: 0, score: 30 }),
      item({ id: 'b', title: 'Follow up', status: 'pending', position: 1, score: 20 }),
    ];
    const atClose = [
      item({
        id: 'a',
        title: 'Call Maya',
        status: 'done',
        position: 0,
        score: 30,
        resolved_at: '2026-08-04T15:00:00.000Z',
        contact_id: 'c1',
      }),
      item({ id: 'b', title: 'Follow up', status: 'deferred', position: 1, score: 20 }),
    ];
    const open = buildOpenSnapshot({
      userId: 'user-1',
      planDate: '2026-08-04',
      items: atOpen,
      now: new Date('2026-08-04T08:00:00.000Z'),
    });
    const close = buildCloseSnapshot({
      userId: 'user-1',
      planDate: '2026-08-04',
      items: atClose,
      source: 'manual_close',
      open,
      journal: {
        priorityWasMain: true,
        outcome: 'done',
        reason: 'Termin erfolgreich',
        tomorrowNote: 'Follow up Sam',
      },
      now: new Date('2026-08-04T19:00:00.000Z'),
    });
    expect(close.version).toBe(2);
    expect(close.outcome).toBe('done');
    expect(close.reason).toBe('Termin erfolgreich');
    expect(close.tomorrowNote).toBe('Follow up Sam');
    expect(close.evidence[0]?.itemId).toBe('a');
    expect(close.tomorrowSeed[0]).toBe('Follow up Sam');
    expect(close.source).toBe('manual_close');
  });

  it('downgrades fake done to missed when no evidence', () => {
    const items = [item({ id: 'a', title: 'Call Maya', status: 'pending', position: 0 })];
    const close = buildCloseSnapshot({
      userId: 'user-1',
      planDate: '2026-08-04',
      items,
      source: 'evening_reminder',
      journal: {
        priorityWasMain: false,
        outcome: 'done',
        reason: null,
        tomorrowNote: null,
      },
    });
    expect(close.outcome).toBe('missed');
    expect(close.evidence).toEqual([]);
  });
});

describe('normalizeDayClose', () => {
  it('upgrades v1 records for readers', () => {
    const v1: DayCloseRecordV1 = {
      version: 1,
      userId: 'u',
      planDate: '2026-08-03',
      closedAt: '2026-08-03T19:00:00.000Z',
      outcome: 'partial',
      priorityItemId: 'a',
      priorityTitle: 'Call Maya',
      priorityMissionType: 'follow_up_overdue',
      missionsDone: 1,
      missionsTotal: 2,
      missionsSkipped: 0,
      missionsDeferred: 1,
      openTitles: ['Follow up'],
      tomorrowSeed: ['Follow up'],
      source: 'manual_close',
    };
    const n = normalizeDayClose(v1);
    expect(n?.version).toBe(2);
    expect(n?.tomorrowNote).toBeNull();
    expect(n?.evidence).toEqual([]);
  });
});

describe('shiftPlanDate', () => {
  it('moves local calendar dates across month boundaries', () => {
    expect(shiftPlanDate('2026-08-01', -1)).toBe('2026-07-31');
    expect(shiftPlanDate('2026-08-04', 0)).toBe('2026-08-04');
  });
});

describe('isEveningCloseWindow', () => {
  it('is true from 17:00 local', () => {
    expect(isEveningCloseWindow(new Date('2026-08-04T16:59:00'))).toBe(false);
    expect(isEveningCloseWindow(new Date('2026-08-04T17:00:00'))).toBe(true);
  });
});
