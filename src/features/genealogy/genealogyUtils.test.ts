import { describe, expect, it } from 'vitest';
import {
  filterTreeNodes,
  isInactive,
  isNewPartner,
  isOnline,
  matchesSearch,
} from './genealogyUtils';
import type { GenealogyNode } from './types';

function stub(
  partial: Partial<GenealogyNode> & Pick<GenealogyNode, 'membershipId'>
): GenealogyNode {
  return {
    identityId: partial.membershipId,
    sponsorMembershipId: null,
    depth: 0,
    firstName: 'Clara',
    lastName: 'Coach',
    username: 'clara',
    avatarUrl: null,
    phone: null,
    role: 'berater',
    apTotal: 10,
    rankKey: 'newcomer',
    rankLabel: 'Newcomer',
    frameAsset: 'frame-01',
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

describe('genealogyUtils', () => {
  it('erkennt Online innerhalb von 15 Minuten', () => {
    const now = Date.UTC(2026, 7, 3, 12, 0, 0);
    const node = stub({
      membershipId: '1',
      lastAppOpenedAt: new Date(now - 5 * 60_000).toISOString(),
    });
    expect(isOnline(node, now)).toBe(true);
    expect(isInactive(node, now)).toBe(false);
  });

  it('filtert Suche und hält Ahnenkette', () => {
    const root = stub({ membershipId: 'r', depth: 0, firstName: 'Anna' });
    const mid = stub({
      membershipId: 'm',
      depth: 1,
      sponsorMembershipId: 'r',
      firstName: 'Bert',
    });
    const leaf = stub({
      membershipId: 'l',
      depth: 2,
      sponsorMembershipId: 'm',
      firstName: 'Zora',
      username: 'zora',
    });
    const keep = filterTreeNodes([root, mid, leaf], { filter: 'all', search: 'zora' });
    expect(keep.has('l')).toBe(true);
    expect(keep.has('m')).toBe(true);
    expect(keep.has('r')).toBe(true);
  });

  it('matchesSearch ist case-insensitive', () => {
    const node = stub({ membershipId: '1', firstName: 'Emil', rankLabel: 'Active' });
    expect(matchesSearch(node, 'emi')).toBe(true);
    expect(matchesSearch(node, 'active')).toBe(true);
    expect(matchesSearch(node, 'xyz')).toBe(false);
  });

  it('isNewPartner innerhalb von 14 Tagen', () => {
    const now = Date.now();
    expect(
      isNewPartner(
        stub({ membershipId: '1', joinedAt: new Date(now - 2 * 86400000).toISOString() }),
        now
      )
    ).toBe(true);
    expect(
      isNewPartner(
        stub({ membershipId: '1', joinedAt: new Date(now - 30 * 86400000).toISOString() }),
        now
      )
    ).toBe(false);
  });
});
