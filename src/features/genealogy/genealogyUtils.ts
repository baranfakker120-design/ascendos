import type { GenealogyFilter, GenealogyNode } from './types';

const DAY_MS = 86_400_000;

export function displayName(node: GenealogyNode): string {
  const full = `${node.firstName} ${node.lastName}`.trim();
  return full || node.username || 'Partner';
}

export function isOnline(node: GenealogyNode, now = Date.now()): boolean {
  if (!node.lastAppOpenedAt) return false;
  return now - new Date(node.lastAppOpenedAt).getTime() < 15 * 60_000;
}

export function isInactive(node: GenealogyNode, now = Date.now()): boolean {
  if (!node.lastAppOpenedAt) return true;
  return now - new Date(node.lastAppOpenedAt).getTime() > 14 * DAY_MS;
}

export function isNewPartner(node: GenealogyNode, now = Date.now()): boolean {
  return now - new Date(node.joinedAt).getTime() < 14 * DAY_MS;
}

export function isLeaderRole(role: GenealogyNode['role']): boolean {
  return role === 'leader' || role === 'admin' || role === 'super_admin';
}

export function matchesFilter(
  node: GenealogyNode,
  filter: GenealogyFilter,
  now = Date.now()
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'leaders':
      return isLeaderRole(node.role);
    case 'berater':
      return node.role === 'berater';
    case 'new':
      return isNewPartner(node, now);
    case 'inactive':
      return isInactive(node, now);
    case 'high_ap':
      return node.apTotal >= 250;
    default:
      return true;
  }
}

export function matchesSearch(node: GenealogyNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay =
    `${node.firstName} ${node.lastName} ${node.username} ${node.rankLabel ?? ''}`.toLowerCase();
  return hay.includes(q);
}

/** Keep ancestors of matched leaves so the tree stays connected. */
export function filterTreeNodes(
  nodes: GenealogyNode[],
  opts: { filter: GenealogyFilter; search: string; now?: number }
): Set<string> {
  const now = opts.now ?? Date.now();
  const byId = new Map(nodes.map((n) => [n.membershipId, n]));
  const keep = new Set<string>();

  for (const node of nodes) {
    if (!matchesFilter(node, opts.filter, now)) continue;
    if (!matchesSearch(node, opts.search)) continue;
    let cur: GenealogyNode | undefined = node;
    while (cur) {
      if (keep.has(cur.membershipId)) break;
      keep.add(cur.membershipId);
      cur = cur.sponsorMembershipId ? byId.get(cur.sponsorMembershipId) : undefined;
    }
  }

  // Always keep depth-0 root if present
  const root = nodes.find((n) => n.depth === 0);
  if (root) keep.add(root.membershipId);

  return keep;
}

export function presenceLabel(node: GenealogyNode, now = Date.now()): string {
  if (isOnline(node, now)) return 'Online';
  if (!node.lastAppOpenedAt) return 'Noch nie';
  const days = Math.floor((now - new Date(node.lastAppOpenedAt).getTime()) / DAY_MS);
  if (days < 1) return 'Heute aktiv';
  if (days === 1) return 'Gestern';
  if (days < 14) return `Vor ${days} Tagen`;
  return `Inaktiv · ${days}d`;
}

/** True when the tree has no downline partners (only self / empty). */
export function hasNoTeamPartners(nodes: GenealogyNode[]): boolean {
  return nodes.every((n) => n.depth === 0) || nodes.filter((n) => n.depth > 0).length === 0;
}
