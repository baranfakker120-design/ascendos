import { describe, expect, it } from 'vitest';
import { layoutGenealogyTree, intersects, nodeBounds } from './layout';
import type { GenealogyNode } from '../types';

function node(
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
    rankKey: 'newcomer',
    rankLabel: 'Newcomer',
    frameAsset: 'frame-01',
    directCount: 0,
    teamCount: 0,
    lastAppOpenedAt: null,
    isBeraterDesMonats: false,
    joinedAt: new Date().toISOString(),
    ...partial,
  };
}

describe('layoutGenealogyTree', () => {
  it('legt Root und zwei Direkte ohne Überlappung aus', () => {
    const root = 'm-root';
    const a = 'm-a';
    const b = 'm-b';
    const nodes = [
      node({ membershipId: root, depth: 0, firstName: 'Root' }),
      node({ membershipId: a, depth: 1, sponsorMembershipId: root, firstName: 'Ada' }),
      node({ membershipId: b, depth: 1, sponsorMembershipId: root, firstName: 'Ben' }),
    ];
    const layout = layoutGenealogyTree(nodes, new Set());
    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(2);

    const boxes = layout.nodes.map(nodeBounds);
    // Sibling cards should not overlap horizontally
    const ada = layout.nodes.find((n) => n.id === a)!;
    const ben = layout.nodes.find((n) => n.id === b)!;
    expect(Math.abs(ada.x - ben.x)).toBeGreaterThan(160);
    expect(intersects(boxes[0]!, boxes[0]!)).toBe(true);
  });

  it('blendet Nachkommen bei Collapse aus', () => {
    const root = 'm-root';
    const child = 'm-child';
    const grand = 'm-grand';
    const nodes = [
      node({ membershipId: root, depth: 0 }),
      node({ membershipId: child, depth: 1, sponsorMembershipId: root }),
      node({ membershipId: grand, depth: 2, sponsorMembershipId: child }),
    ];
    const layout = layoutGenealogyTree(nodes, new Set([child]));
    expect(layout.nodes.map((n) => n.id).sort()).toEqual([child, root].sort());
    expect(layout.edges).toHaveLength(1);
  });
});
