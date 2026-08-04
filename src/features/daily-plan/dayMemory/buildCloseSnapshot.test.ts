import { describe, expect, it } from 'vitest';
import type { DailyPlanItem } from '@shared/types/domain';
import {
  buildCloseSnapshot,
  buildOpenSnapshot,
  buildTomorrowSeed,
  deriveCloseOutcome,
  pickPriorityMission,
} from './buildCloseSnapshot';
import { shiftPlanDate } from './dayMemoryStore';

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
  it('carries open and skipped titles, capped and unique', () => {
    const items = [
      item({ id: 'a', title: 'Call Maya', status: 'skipped', position: 0 }),
      item({ id: 'b', title: 'Call Maya', status: 'pending', position: 1 }),
      item({ id: 'c', title: 'Fit-Check', status: 'deferred', position: 2 }),
      item({ id: 'd', title: 'Done one', status: 'done', position: 3 }),
    ];
    expect(buildTomorrowSeed(items)).toEqual(['Call Maya', 'Fit-Check']);
  });
});

describe('buildCloseSnapshot', () => {
  it('writes a durable close record with tomorrow seed', () => {
    const atOpen = [
      item({ id: 'a', title: 'Call Maya', status: 'pending', position: 0, score: 30 }),
      item({ id: 'b', title: 'Follow up', status: 'pending', position: 1, score: 20 }),
    ];
    const atClose = [
      item({ id: 'a', title: 'Call Maya', status: 'done', position: 0, score: 30 }),
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
      now: new Date('2026-08-04T19:00:00.000Z'),
    });
    expect(close.outcome).toBe('partial');
    expect(close.priorityTitle).toBe('Call Maya');
    expect(close.tomorrowSeed).toEqual(['Follow up']);
    expect(close.source).toBe('manual_close');
    expect(close.missionsDone).toBe(1);
  });
});

describe('shiftPlanDate', () => {
  it('moves local calendar dates across month boundaries', () => {
    expect(shiftPlanDate('2026-08-01', -1)).toBe('2026-07-31');
    expect(shiftPlanDate('2026-08-04', 0)).toBe('2026-08-04');
  });
});
