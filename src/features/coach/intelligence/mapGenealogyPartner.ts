import type { CoachPartnerSnapshot } from './types';

/** Duck-typed map from genealogy node fields — no engine import. */
export function mapGenealogyNodeToPartner(node: {
  membershipId: string;
  firstName: string;
  lastName: string;
  username: string;
  depth: number;
  apTotal: number;
  icpMonth: number;
  streakDays: number;
  directCount: number;
  teamCount: number;
  lastAppOpenedAt: string | null;
  joinedAt: string;
  rankLabel: string | null;
  isFavorite: boolean;
  sponsorMembershipId: string | null;
}): CoachPartnerSnapshot {
  return {
    membershipId: node.membershipId,
    name: `${node.firstName} ${node.lastName}`.trim() || node.username,
    depth: node.depth,
    apTotal: node.apTotal,
    icpMonth: node.icpMonth,
    streakDays: node.streakDays,
    directCount: node.directCount,
    teamCount: node.teamCount,
    lastAppOpenedAt: node.lastAppOpenedAt,
    joinedAt: node.joinedAt,
    rankLabel: node.rankLabel,
    isFavorite: node.isFavorite,
    sponsorMembershipId: node.sponsorMembershipId,
  };
}
