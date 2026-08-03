import { describe, expect, it } from 'vitest';
import { hasNoTeamPartners } from './genealogyApi';
import type { GenealogyNode } from './types';

function stub(
  partial: Partial<GenealogyNode> & Pick<GenealogyNode, 'membershipId' | 'depth'>
): GenealogyNode {
  return {
    identityId: partial.membershipId,
    sponsorMembershipId: null,
    firstName: 'A',
    lastName: 'B',
    username: 'u',
    avatarUrl: null,
    phone: null,
    role: 'berater',
    apTotal: 0,
    rankKey: null,
    rankLabel: null,
    frameAsset: null,
    directCount: 0,
    teamCount: 0,
    lastAppOpenedAt: null,
    isBeraterDesMonats: false,
    joinedAt: new Date().toISOString(),
    icpMonth: 0,
    streakDays: 0,
    isFavorite: false,
    sponsorName: null,
    messageBadge: 0,
    ...partial,
  };
}

describe('hasNoTeamPartners', () => {
  it('ist true bei leerem Array oder nur Root', () => {
    expect(hasNoTeamPartners([])).toBe(true);
    expect(hasNoTeamPartners([stub({ membershipId: 'me', depth: 0 })])).toBe(true);
  });

  it('ist false sobald Downline existiert', () => {
    expect(
      hasNoTeamPartners([
        stub({ membershipId: 'me', depth: 0 }),
        stub({ membershipId: 'p1', depth: 1 }),
      ])
    ).toBe(false);
  });
});
