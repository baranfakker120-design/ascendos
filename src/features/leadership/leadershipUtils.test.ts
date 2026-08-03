import { describe, expect, it } from 'vitest';
import { goalProgressPct, missingFirstlines, sortFavoritesFirst } from './leadershipUtils';

describe('leadershipUtils', () => {
  it('computes TeamLeader missing firstlines', () => {
    expect(missingFirstlines(3, 5)).toBe(2);
    expect(missingFirstlines(5, 5)).toBe(0);
    expect(missingFirstlines(7, 5)).toBe(0);
  });

  it('clamps goal progress', () => {
    expect(goalProgressPct(0, 2500)).toBe(0);
    expect(goalProgressPct(1250, 2500)).toBe(50);
    expect(goalProgressPct(5000, 2500)).toBe(100);
    expect(goalProgressPct(10, 0)).toBe(0);
  });

  it('sorts favorites before peers at same depth', () => {
    const nodes = [
      { membershipId: 'a', depth: 1, isFavorite: false, firstName: 'Zed' },
      { membershipId: 'b', depth: 1, isFavorite: true, firstName: 'Ann' },
      { membershipId: 'c', depth: 0, isFavorite: false, firstName: 'Root' },
    ];
    expect(sortFavoritesFirst(nodes).map((n) => n.membershipId)).toEqual(['c', 'b', 'a']);
  });
});
