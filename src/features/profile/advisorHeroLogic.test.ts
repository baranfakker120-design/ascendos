import { describe, expect, it } from 'vitest';
import { podiumForPeriod, shouldShowAdvisorHero } from './advisorHeroLogic';
import type { MonthlyAwardRow } from './AdvisorAwardsHistory';
import { utcMonthStart } from './monthlyAwardsLogic';

function row(partial: Partial<MonthlyAwardRow> & Pick<MonthlyAwardRow, 'place'>): MonthlyAwardRow {
  return {
    period: utcMonthStart(),
    membership_id: `m-${partial.place}`,
    ap_in_period: 100,
    display_name: `P${partial.place}`,
    avatar_url: null,
    username: `u${partial.place}`,
    is_me: false,
    created_at: '2026-04-01T00:00:00Z',
    ...partial,
  };
}

describe('advisorHeroLogic', () => {
  it('shows when podium exists and not seen', () => {
    expect(
      shouldShowAdvisorHero({
        titlePeriod: utcMonthStart(),
        awards: [row({ place: 1 }), row({ place: 2 })],
        alreadySeen: false,
        awardsReady: true,
        seenReady: true,
      })
    ).toBe(true);
  });

  it('hides when already seen', () => {
    expect(
      shouldShowAdvisorHero({
        titlePeriod: utcMonthStart(),
        awards: [row({ place: 1 })],
        alreadySeen: true,
        awardsReady: true,
        seenReady: true,
      })
    ).toBe(false);
  });

  it('hides when no awards', () => {
    expect(
      shouldShowAdvisorHero({
        titlePeriod: utcMonthStart(),
        awards: [],
        alreadySeen: false,
        awardsReady: true,
        seenReady: true,
      })
    ).toBe(false);
  });

  it('sorts podium by place', () => {
    expect(
      podiumForPeriod(
        [row({ place: 3 }), row({ place: 1 }), row({ place: 2 })],
        utcMonthStart()
      ).map((r) => r.place)
    ).toEqual([1, 2, 3]);
  });
});
