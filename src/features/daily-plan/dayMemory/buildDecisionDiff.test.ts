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
  it('returns honest no_close / stable when nothing real changed', () => {
    const result = buildDecisionDiff({
      yesterdayClose: null,
      todayItems: [],
      warnings: [],
      followUps: [],
    });
    expect(result.mode).toBe('no_close');
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.kind).toBe('stable');
  });

  it('ranks missed priority and colder contact by impact, max 5', () => {
    const result = buildDecisionDiff({
      yesterdayClose: close({ outcome: 'missed' }),
      todayItems: [
        { id: 'p1', title: 'Call Maya', status: 'pending', score: 30, position: 0 },
        { id: 'p2', title: 'Follow up Sam', status: 'pending', score: 20, position: 1 },
      ],
      warnings: [
        {
          kind: 'no_activity_7d',
          title: 'Quiet',
          name: 'Alex',
          action: 'Alex idle 7 days — check in before momentum dies.',
          severity: 'high',
        },
      ],
      followUps: [
        {
          contactId: 'c1',
          name: 'Nora',
          heat: 'forgotten',
          why: 'Nora has been inactive for 12 days. Waiting longer raises the chance of losing the thread.',
        },
        {
          contactId: 'c2',
          name: 'Ken',
          heat: 'hot',
          why: 'Ken opened the presentation yesterday — window is open.',
        },
      ],
      partnerSignals: [
        {
          membershipId: 'm1',
          name: 'Dogukan',
          tone: 'inactive',
          detail: 'Dogukan has been inactive for 5 days. If nothing changes, momentum drops.',
        },
      ],
    });

    expect(result.mode).toBe('changes');
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes.length).toBeLessThanOrEqual(5);
    // Highest impact first
    for (let i = 1; i < result.changes.length; i++) {
      expect(result.changes[i - 1]!.impact).toBeGreaterThanOrEqual(result.changes[i]!.impact);
    }
    expect(result.changes.every((c) => c.why.length > 0 && c.soWhat)).toBe(true);
    expect(result.suggestedFocus).toBeTruthy();
  });

  it('celebrates completed priority without inventing extra noise', () => {
    const result = buildDecisionDiff({
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
    expect(result.changes.some((c) => c.kind === 'priority_done')).toBe(true);
    expect(result.changes.every((c) => c.kind !== 'contact_colder')).toBe(true);
  });

  it('returns stable when yesterday was clean and no live signals', () => {
    const result = buildDecisionDiff({
      yesterdayClose: close({
        outcome: 'done',
        priorityTitle: null,
        priorityItemId: null,
        tomorrowSeed: [],
        openTitles: [],
        missionsDone: 1,
        missionsTotal: 1,
        missionsDeferred: 0,
      }),
      todayItems: [],
      warnings: [],
      followUps: [],
    });
    expect(result.mode).toBe('stable');
    expect(result.changes[0]?.kind).toBe('stable');
  });

  it('soft-dedupes identical ids from yesterday without inventing replacements', () => {
    const result = buildDecisionDiff({
      yesterdayClose: close({ outcome: 'partial' }),
      todayItems: [{ id: 'p1', title: 'Call Maya', status: 'pending', score: 10, position: 0 }],
      warnings: [],
      followUps: [],
      previouslyShownIds: ['priority-open:p1', 'carry:Follow up Sam'],
    });
    expect(result.changes.length).toBeGreaterThan(0);
    const open = result.changes.find((c) => c.id.startsWith('priority-open:'));
    expect(open && open.impact < 92).toBe(true);
  });

  it('attaches So what? to every change', () => {
    const result = buildDecisionDiff({
      yesterdayClose: close({ outcome: 'done', tomorrowSeed: [], openTitles: [] }),
      todayItems: [],
      warnings: [],
      followUps: [{ contactId: 'c1', name: 'Nora', heat: 'forgotten', why: '12 days idle' }],
    });
    for (const c of result.changes) {
      expect(['follow_today', 'wait', 'observe', 'celebrate', 'prepare']).toContain(c.soWhat);
    }
  });
});
