/** Sprint 4.2 — Leader Experience domain types. */

export interface LeaderDashboard {
  activeToday: number;
  newRegistrationsMonth: number;
  newCustomersMonth: number;
  openFollowups: number;
  teamAp: number;
  teamSize: number;
  directCount: number;
  inactive14d: number;
  tasksDoneToday: number;
  icpMonth: number;
  monthGoalAp: number;
  goalProgress: number;
  myApTotal: number;
  tasksDoneByTeamToday: Array<{
    membershipId: string;
    name: string;
    ap: number;
    tasks: number;
  }>;
}

export type LeaderboardPeriod = 'today' | 'week' | 'month' | 'year';
export type LeaderboardSort = 'ap' | 'icp' | 'new_partners' | 'sales' | 'activity';

export interface LeaderboardEntry {
  membershipId: string;
  identityId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  rankLabel: string | null;
  frameAsset: string | null;
  metric: number;
  apTotal: number;
  directCount: number;
}

export interface TeamInsight {
  kind: string;
  emoji: string;
  title: string;
  membershipId: string;
  name: string;
  detail: string;
}

export interface SmartWarning {
  kind: string;
  membershipId: string;
  name: string;
  title: string;
  action: string;
}

export interface TeamLeaderProgress {
  membershipId: string;
  activeFirstlines: number;
  requiredFirstlines: number;
  qualified: boolean;
  qualifiedAt: string | null;
  bonusEntitled: boolean;
  bonusPaid: boolean;
  bonusAmountCents: number;
}

export interface QualificationProgress {
  membershipId: string;
  apTotal: number;
  currentRank: {
    key: string;
    label: string;
    thresholdAp: number;
    frameAsset: string | null;
  } | null;
  nextRank: {
    key: string;
    label: string;
    thresholdAp: number;
    remainingAp: number;
  } | null;
  teamLeader: {
    qualified: boolean;
    activeFirstlines: number;
    requiredFirstlines: number;
    bonusAmountCents: number;
    bonusPaid: boolean;
    qualifiedAt: string | null;
  };
  unlockedRewards: Array<{ kind: string; amountCents: number; note: string | null }>;
}

export interface ApTaskDef {
  id: string;
  key: string;
  title: string;
  description: string | null;
  category: string;
  difficulty: string;
  ap: number;
  repeatable: boolean;
  cooldownHours: number | null;
  sortOrder: number;
}
