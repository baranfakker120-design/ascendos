import { describe, expect, it } from 'vitest';
import {
  monthlyAwardPeriods,
  rankMonthlyAwardCandidates,
  utcMonthStart,
  utcPreviousMonthStart,
} from './monthlyAwardsLogic';

describe('monthlyAwardsLogic', () => {
  it('computes UTC title and activity periods', () => {
    const d = new Date(Date.UTC(2026, 3, 15, 12, 0, 0)); // 15 Apr 2026
    expect(utcMonthStart(d)).toBe('2026-04-01');
    expect(utcPreviousMonthStart(d)).toBe('2026-03-01');
    expect(monthlyAwardPeriods(d)).toEqual({
      titlePeriod: '2026-04-01',
      activityStart: '2026-03-01',
      activityEnd: '2026-04-01',
    });
  });

  it('handles January → previous December', () => {
    const d = new Date(Date.UTC(2026, 0, 1, 0, 5, 0));
    expect(monthlyAwardPeriods(d)).toEqual({
      titlePeriod: '2026-01-01',
      activityStart: '2025-12-01',
      activityEnd: '2026-01-01',
    });
  });

  it('ranks by AP then seniority then id', () => {
    const ranked = rankMonthlyAwardCandidates([
      { membershipId: 'm-c', apInPeriod: 100, createdAt: '2025-01-03T00:00:00Z' },
      { membershipId: 'm-a', apInPeriod: 200, createdAt: '2025-01-02T00:00:00Z' },
      { membershipId: 'm-b', apInPeriod: 200, createdAt: '2025-01-01T00:00:00Z' },
      { membershipId: 'm-d', apInPeriod: 0, createdAt: '2025-01-01T00:00:00Z' },
      { membershipId: 'm-e', apInPeriod: 50, createdAt: '2025-01-01T00:00:00Z' },
    ]);
    expect(ranked.map((r) => r.membershipId)).toEqual(['m-b', 'm-a', 'm-c']);
  });

  it('returns fewer than 3 when not enough positive AP', () => {
    expect(
      rankMonthlyAwardCandidates([
        { membershipId: 'm-1', apInPeriod: 10, createdAt: '2025-01-01T00:00:00Z' },
      ])
    ).toHaveLength(1);
  });
});
