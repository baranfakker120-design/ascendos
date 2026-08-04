import { describe, expect, it } from 'vitest';
import { buildDecisionDiff } from './buildDecisionDiff';
import type { DayCloseRecord } from './types';

function close(partial: Partial<DayCloseRecord> & Pick<DayCloseRecord, 'outcome'>): DayCloseRecord {
  return {
    version: 1,
    userId: 'u1',
    planDate: '2026-08-03',
    closedAt: '2026-08-03T19:00:00.000Z',
    priorityItemId: 'p1',
    priorityTitle: 'Call Maya',
    priorityMissionType: 'follow_up_overdue',
    missionsDone: 1,
    missionsTotal: 2,
    missionsSkipped: 0,
    missionsDeferred: 1,
    openTitles: ['Follow up Sam'],
    tomorrowSeed: ['Follow up Sam'],
    source: 'manual_close',
    ...partial,
  };
}

describe('buildDecisionDiff', () => {
  it('returns clean_start when yesterday was never closed', () => {
    const lines = buildDecisionDiff({
      yesterdayClose: null,
      todayItems: [],
      warnings: [],
      followUps: [],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.kind).toBe('clean_start');
    expect(lines[0]?.why).toBe('no_close');
  });

  it('surfaces missed priority and carry-over from close seed', () => {
    const lines = buildDecisionDiff({
      yesterdayClose: close({ outcome: 'partial' }),
      todayItems: [
        {
          id: 'p1',
          title: 'Call Maya',
          status: 'pending',
          score: 30,
          position: 0,
        },
        {
          id: 'p2',
          title: 'Follow up Sam',
          status: 'pending',
          score: 20,
          position: 1,
        },
      ],
      warnings: [],
      followUps: [],
    });
    expect(lines.map((l) => l.kind)).toEqual(['missed_priority', 'carry_over']);
    expect(lines[0]?.title).toBe('Call Maya');
    expect(lines[1]?.title).toBe('Follow up Sam');
  });

  it('adds team_signal and plan_delta without exceeding 4 lines', () => {
    const lines = buildDecisionDiff({
      yesterdayClose: close({ outcome: 'missed' }),
      todayItems: [{ id: 'p1', title: 'Call Maya', status: 'pending', score: 10, position: 0 }],
      warnings: [{ kind: 'no_activity_7d', title: 'Quiet', name: 'Alex', action: 'Check in' }],
      followUps: [
        { contactId: 'c1', name: 'Nora', heat: 'forgotten', why: 'No touch in 12 days' },
      ],
    });
    expect(lines.length).toBeLessThanOrEqual(4);
    expect(lines.some((l) => l.kind === 'team_signal')).toBe(true);
    expect(lines.some((l) => l.kind === 'plan_delta' && l.title === 'Nora')).toBe(true);
  });

  it('returns clean_start after a fully closed clean day', () => {
    const lines = buildDecisionDiff({
      yesterdayClose: close({
        outcome: 'done',
        tomorrowSeed: [],
        openTitles: [],
        missionsDone: 2,
        missionsTotal: 2,
        missionsDeferred: 0,
      }),
      todayItems: [],
      warnings: [],
      followUps: [],
    });
    expect(lines).toEqual([
      expect.objectContaining({ kind: 'clean_start', why: 'yesterday_clean' }),
    ]);
  });
});
