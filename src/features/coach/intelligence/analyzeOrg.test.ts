import { describe, expect, it } from 'vitest';
import {
  assessOrgHealth,
  buildCoachOrgIntelligence,
  buildFollowUpRecommendations,
  buildPersonInsight,
  isMorningWindow,
  selectSurfaceInsights,
} from './analyzeOrg';
import { buildMessageDraft } from './messageDrafts';
import type { CoachOrgInput, CoachPartnerSnapshot } from './types';

function partner(
  partial: Partial<CoachPartnerSnapshot> & { membershipId: string; name: string }
): CoachPartnerSnapshot {
  return {
    depth: 1,
    apTotal: 100,
    icpMonth: 0,
    streakDays: 0,
    directCount: 0,
    teamCount: 0,
    lastAppOpenedAt: null,
    joinedAt: '2026-07-20T00:00:00Z',
    rankLabel: null,
    isFavorite: false,
    sponsorMembershipId: 'root',
    ...partial,
  };
}

function baseInput(now = new Date('2026-08-03T09:00:00')): CoachOrgInput {
  return {
    now,
    sponsorFirstName: 'Seyda',
    dashboard: {
      activeToday: 3,
      newRegistrationsMonth: 2,
      openFollowups: 4,
      teamAp: 1200,
      teamSize: 10,
      directCount: 5,
      inactive14d: 2,
      tasksDoneToday: 1,
      icpMonth: 3,
      myApTotal: 400,
    },
    partners: [
      partner({
        membershipId: 'm1',
        name: 'Dogukan',
        lastAppOpenedAt: '2026-07-25T00:00:00Z',
        joinedAt: '2026-07-28T00:00:00Z',
      }),
      partner({
        membershipId: 'm2',
        name: 'Anna',
        streakDays: 8,
        lastAppOpenedAt: '2026-08-03T08:00:00Z',
        icpMonth: 2,
        directCount: 3,
      }),
    ],
    contacts: [
      {
        id: 'c1',
        name: 'Hot Prospect',
        phase: 'fit_check',
        lastEventAt: '2026-08-02T12:00:00Z',
        nextStep: 'Call',
      },
      {
        id: 'c2',
        name: 'Forgotten',
        phase: 'im_gespraech',
        lastEventAt: '2026-07-15T12:00:00Z',
        nextStep: null,
      },
    ],
    warnings: [
      {
        kind: 'inactive',
        membershipId: 'm1',
        name: 'Dogukan',
        title: 'Dogukan ist inaktiv',
        action: 'Reaktivieren',
      },
    ],
    insights: [],
    teamLeader: { activeFirstlines: 3, requiredFirstlines: 5, qualified: false },
    pendingShareProofs: 1,
    planPendingCount: 2,
    planDoneCount: 0,
  };
}

describe('coach COO intelligence', () => {
  it('explains team health instead of only grading', () => {
    const health = assessOrgHealth(baseInput());
    expect(health.why.length).toBeGreaterThan(0);
    expect(health.label).toBeTruthy();
    expect(health.score).toBeGreaterThanOrEqual(0);
  });

  it('builds a morning briefing with a highest priority', () => {
    const intel = buildCoachOrgIntelligence(baseInput());
    expect(intel.briefing.greeting).toContain('Seyda');
    expect(intel.briefing.highestPriority).toBeTruthy();
    expect(intel.surfaceInsights.length).toBeGreaterThan(0);
    expect(intel.surfaceInsights.length).toBeLessThanOrEqual(4);
    expect(intel.managerMessages.length).toBeGreaterThan(0);
    expect(intel.managerMessages.every((m) => m.why.length > 0)).toBe(true);
  });

  it('detects hot and forgotten contacts', () => {
    const fus = buildFollowUpRecommendations(baseInput().contacts, baseInput().now);
    expect(fus.some((f) => f.heat === 'hot')).toBe(true);
    expect(fus.some((f) => f.heat === 'forgotten')).toBe(true);
  });

  it('analyzes a single partner with WHY and probabilities', () => {
    const insight = buildPersonInsight(
      partner({
        membershipId: 'm1',
        name: 'Dogukan',
        lastAppOpenedAt: '2026-07-20T00:00:00Z',
      }),
      new Date('2026-08-03T09:00:00')
    );
    expect(insight.headline.toLowerCase()).toContain('inaktiv');
    expect(insight.recommendation).toBe('reactivation');
    expect(insight.nextBestActionWhy.toLowerCase()).toContain('weil');
    expect(insight.suggestedWhatsApp.length).toBeGreaterThan(10);
    expect(insight.riskScore).toBeGreaterThan(0);
    expect(insight.probabilityOfInactivity).toBeGreaterThan(50);
  });

  it('keeps message drafts sponsor-approved only', () => {
    const draft = buildMessageDraft('onboarding', {
      firstName: 'Dogukan',
      onboardingUrl: 'https://test-onboarding.example',
    });
    expect(draft.requiresSponsorApproval).toBe(true);
    expect(draft.body).toContain('https://test-onboarding.example');
    expect(draft.body).not.toMatch(/waytomoon\.netlify\.app/i);
  });

  it('omits onboarding URL when active org has none configured', () => {
    const draft = buildMessageDraft('onboarding', { firstName: 'Dogukan' });
    expect(draft.body).not.toMatch(/waytomoon\.netlify\.app/i);
    expect(draft.body).not.toMatch(/teamseydaguide/i);
  });

  it('limits surface insights to high-value items', () => {
    const intel = buildCoachOrgIntelligence(baseInput());
    const surface = selectSurfaceInsights(intel.priorities, 3);
    expect(surface.length).toBeLessThanOrEqual(3);
    expect(surface.every((p) => p.severity !== 'low')).toBe(true);
  });

  it('detects morning vs evening window', () => {
    expect(isMorningWindow(new Date('2026-08-03T10:00:00'))).toBe(true);
    expect(isMorningWindow(new Date('2026-08-03T19:00:00'))).toBe(false);
  });
});
