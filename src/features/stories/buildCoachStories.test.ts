import { describe, expect, it } from 'vitest';
import { buildCoachOrgIntelligence } from '@features/coach/intelligence/analyzeOrg';
import type { CoachOrgInput, CoachPartnerSnapshot } from '@features/coach/intelligence/types';
import { buildCoachStories, isStoryActive, mergeStoryFeeds } from './buildCoachStories';
import type { StoryCard } from './types';

function partner(
  partial: Partial<CoachPartnerSnapshot> & { membershipId: string; name: string }
): CoachPartnerSnapshot {
  return {
    depth: 1,
    apTotal: 120,
    icpMonth: 2,
    streakDays: 6,
    directCount: 1,
    teamCount: 2,
    lastAppOpenedAt: '2026-08-03T08:00:00Z',
    joinedAt: '2026-07-20T00:00:00Z',
    rankLabel: null,
    isFavorite: false,
    sponsorMembershipId: 'root',
    ...partial,
  };
}

function input(): CoachOrgInput {
  return {
    now: new Date('2026-08-03T09:00:00Z'),
    sponsorFirstName: 'Seyda',
    dashboard: {
      activeToday: 4,
      newRegistrationsMonth: 2,
      openFollowups: 2,
      teamAp: 900,
      teamSize: 8,
      directCount: 4,
      inactive14d: 1,
      tasksDoneToday: 2,
      icpMonth: 3,
      myApTotal: 300,
    },
    partners: [
      partner({ membershipId: 'm1', name: 'Tina Adler', streakDays: 8, icpMonth: 3 }),
      partner({ membershipId: 'm2', name: 'Zuhal Yilmaz', streakDays: 7 }),
    ],
    contacts: [],
    warnings: [],
    insights: [],
    teamLeader: { activeFirstlines: 3, requiredFirstlines: 4, qualified: false },
    pendingShareProofs: 0,
    planPendingCount: 1,
    planDoneCount: 2,
  };
}

describe('buildCoachStories', () => {
  it('creates optimistic coach stories from verified intelligence', () => {
    const intel = buildCoachOrgIntelligence(input());
    const stories = buildCoachStories(intel);
    expect(stories.length).toBeGreaterThan(0);
    expect(stories.every((s) => s.source === 'coach')).toBe(true);
    expect(
      stories.every((s) => s.tone === 'motivate' || s.tone === 'celebrate' || s.tone === 'inspire')
    ).toBe(true);
    // Never shame language
    const blob = stories.map((s) => s.body.toLowerCase()).join(' ');
    expect(blob.includes('shame')).toBe(false);
    expect(blob.includes('worse than')).toBe(false);
  });

  it('drops expired stories when merging', () => {
    const now = new Date('2026-08-03T12:00:00Z');
    const alive: StoryCard = {
      id: 'a',
      type: 'admin',
      mediaKind: 'text',
      title: 'A',
      body: 'Alive',
      authorLabel: 'Ascend',
      subjectName: null,
      mediaUrl: null,
      tone: 'celebrate',
      source: 'admin',
      publishedAt: '2026-08-03T10:00:00Z',
      expiresAt: '2026-08-04T10:00:00Z',
      accent: 'ink',
    };
    const dead: StoryCard = {
      ...alive,
      id: 'b',
      expiresAt: '2026-08-03T11:00:00Z',
    };
    expect(isStoryActive(alive, now)).toBe(true);
    expect(isStoryActive(dead, now)).toBe(false);
    expect(mergeStoryFeeds([alive, dead], [], now).map((s) => s.id)).toEqual(['a']);
  });
});
