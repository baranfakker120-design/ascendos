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
    icpMonth: 0,
    streakDays: 0,
    isFavorite: false,
    sponsorName: null,
    messageBadge: 0,
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

  it('erzeugt für 3 Direkte genau 3 Kanten inkl. vertikalem Center-Child', () => {
    const root = 'm-root';
    const a = 'm-a';
    const b = 'm-b';
    const c = 'm-c';
    const nodes = [
      node({ membershipId: root, depth: 0 }),
      node({ membershipId: a, depth: 1, sponsorMembershipId: root }),
      node({ membershipId: b, depth: 1, sponsorMembershipId: root }),
      node({ membershipId: c, depth: 1, sponsorMembershipId: root }),
    ];
    const layout = layoutGenealogyTree(nodes, new Set());
    expect(layout.edges).toHaveLength(3);
    expect(new Set(layout.edges.map((e) => e.id)).size).toBe(3);

    const parent = layout.nodes.find((n) => n.id === root)!;
    const kids = layout.nodes.filter((n) => n.parentId === root).sort((p, q) => p.x - q.x);
    expect(kids).toHaveLength(3);

    // Middle child aligns under parent (tidy mean) → vertical edge
    const mid = kids[1]!;
    expect(mid.x).toBeCloseTo(parent.x, 5);
    const midEdge = layout.edges.find((e) => e.toId === mid.id)!;
    expect(midEdge).toBeTruthy();
    expect(midEdge.x1).toBeCloseTo(midEdge.x2, 5);
    expect(midEdge.y2).toBeGreaterThan(midEdge.y1);
  });
});
