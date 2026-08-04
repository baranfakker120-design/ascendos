import { describe, expect, it } from 'vitest';
import { nextLiveCoachingStartsAt } from './repeatRule';

describe('nextLiveCoachingStartsAt', () => {
  it('advances weekly', () => {
    const start = new Date('2026-08-03T18:00:00.000Z');
    expect(nextLiveCoachingStartsAt(start, 'weekly').toISOString()).toBe(
      '2026-08-10T18:00:00.000Z'
    );
  });

  it('advances monthly across year boundary', () => {
    const start = new Date('2026-12-15T10:00:00.000Z');
    expect(nextLiveCoachingStartsAt(start, 'monthly').toISOString()).toBe(
      '2027-01-15T10:00:00.000Z'
    );
  });
});
