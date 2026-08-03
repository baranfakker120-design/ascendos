import { describe, expect, it } from 'vitest';
import { buildCoachOrgIntelligence } from './analyzeOrg';
import {
  buildExecutiveIntelligence,
  buildLeadershipScore,
  buildMomentumScore,
} from './executiveIntelligence';
import type { CoachOrgInput, CoachPartnerSnapshot } from './types';

function partner(
  partial: Partial<CoachPartnerSnapshot> & { membershipId: string; name: string }
): CoachPartnerSnapshot {
  return {
    depth: 1,
    apTotal: 100,
    icpMonth: 1,
    streakDays: 4,
    directCount: 0,
    teamCount: 0,
    lastAppOpenedAt: '2026-08-03T08:00:00Z',
    joinedAt: '2026-07-15T00:00:00Z',
    rankLabel: null,
    isFavorite: true,
    sponsorMembershipId: 'root',
    ...partial,
  };
}

function input(): CoachOrgInput {
  return {
    now: new Date('2026-08-03T09:00:00Z'),
    sponsorFirstName: 'Seyda',
    dashboard: {
      activeToday: 3,
      newRegistrationsMonth: 1,
      openFollowups: 4,
      teamAp: 800,
      teamSize: 10,
      directCount: 5,
      inactive14d: 3,
      tasksDoneToday: 2,
      icpMonth: 2,
      myApTotal: 250,
    },
    partners: [partner({ membershipId: 'm1', name: 'Tina' })],
    contacts: [],
    warnings: [],
    insights: [],
    teamLeader: { activeFirstlines: 3, requiredFirstlines: 4, qualified: false },
    pendingShareProofs: 0,
    planPendingCount: 2,
    planDoneCount: 1,
  };
}

describe('executiveIntelligence', () => {
  it('pairs every score with WHY and answers COO questions', () => {
    const org = buildCoachOrgIntelligence(input());
    expect(org.executive.momentum.why.length).toBeGreaterThan(0);
    expect(org.executive.leadership.why.length).toBeGreaterThan(0);
    expect(org.executive.whatHappened.length).toBeGreaterThan(0);
    expect(org.executive.whyItMatters.length).toBeGreaterThan(0);
    expect(org.executive.whatToDoToday.length).toBeGreaterThan(0);
    expect(org.executive.whatHappensNext.length).toBeGreaterThan(0);
    expect(org.executive.forecast.length).toBe(3);
    expect(org.executive.bottlenecks[0]?.unlock).toBeTruthy();
    expect(org.executive.roiRecommendations[0]?.why).toBeTruthy();
    expect(org.executive.leadershipDna[0]?.why).toBeTruthy();
    expect(org.executive.timeline.length).toBeGreaterThan(0);
  });

  it('builds momentum and leadership as scored dimensions', () => {
    const i = input();
    const m = buildMomentumScore(i);
    const l = buildLeadershipScore(i);
    expect(m.score).toBeGreaterThanOrEqual(0);
    expect(m.score).toBeLessThanOrEqual(100);
    expect(l.score).toBeGreaterThanOrEqual(0);
    expect(l.label.length).toBeGreaterThan(0);
    const pack = buildExecutiveIntelligence(i, orgHealthStub(), []);
    expect(pack.branchHealth.why.length).toBeGreaterThan(0);
  });
});

function orgHealthStub() {
  return {
    grade: 'healthy' as const,
    score: 72,
    why: ['Basis hält.'],
    membershipId: null,
    label: 'Healthy',
  };
}
