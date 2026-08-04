import { utcMonthStart } from './monthlyAwardsLogic';
import type { MonthlyAwardRow } from './AdvisorAwardsHistory';

export type HeroGateInput = {
  titlePeriod: string;
  awards: MonthlyAwardRow[];
  alreadySeen: boolean;
  awardsReady: boolean;
  seenReady: boolean;
};

/** Show HeroScreen once per title month when a podium exists and not yet acknowledged. */
export function shouldShowAdvisorHero(input: HeroGateInput): boolean {
  if (!input.awardsReady || !input.seenReady) return false;
  if (input.alreadySeen) return false;
  if (input.titlePeriod !== utcMonthStart()) return false;
  return input.awards.some((a) => a.period === input.titlePeriod && a.place >= 1 && a.place <= 3);
}

export function podiumForPeriod(awards: MonthlyAwardRow[], period: string): MonthlyAwardRow[] {
  return awards
    .filter((a) => a.period === period && a.place >= 1 && a.place <= 3)
    .sort((a, b) => a.place - b.place);
}
