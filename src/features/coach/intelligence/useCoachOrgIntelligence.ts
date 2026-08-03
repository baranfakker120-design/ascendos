import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@shared/auth/AuthProvider';
import { listPendingShareVerifications } from '@shared/lib/shareVerification';
import { useContacts } from '@features/contacts/contactsApi';
import { localDate, type DailyPlanData } from '@features/daily-plan/dailyPlanApi';
import { useGenealogyTree } from '@features/genealogy/genealogyApi';
import type { GenealogyNode } from '@features/genealogy/types';
import {
  useLeaderDashboard,
  useSmartWarnings,
  useTeamInsights,
  useTeamLeaderProgress,
} from '@features/leadership/leadershipApi';
import { buildCoachOrgIntelligence, isMorningWindow } from './analyzeOrg';
import type {
  CoachContactSnapshot,
  CoachOrgInput,
  CoachOrgIntelligence,
  CoachPartnerSnapshot,
} from './types';

function mapPartner(node: GenealogyNode): CoachPartnerSnapshot {
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

/**
 * Composes EXISTING React Query hooks — no new RPCs/schema.
 * Daily plan is read from cache only (no generate_daily_plan side effect).
 */
export function useCoachOrgIntelligence(enabled = true): {
  intelligence: CoachOrgIntelligence | null;
  isMorning: boolean;
  isLoading: boolean;
} {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const dash = useLeaderDashboard();
  const insights = useTeamInsights();
  const warnings = useSmartWarnings();
  const tree = useGenealogyTree();
  const tl = useTeamLeaderProgress();
  const contacts = useContacts({ limit: 50 });

  const intelligence = useMemo(() => {
    if (!enabled || !profile) return null;

    const now = new Date();
    const partners = (tree.data ?? []).map(mapPartner);
    const contactRows: CoachContactSnapshot[] = (contacts.data?.items ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      phase: c.phase,
      lastEventAt: c.last_event_at,
      nextStep: c.next_step,
    }));

    const cachedPlan = queryClient.getQueryData<DailyPlanData>([
      'daily-plan',
      profile.id,
      localDate(),
    ]);
    const d = dash.data;
    const input: CoachOrgInput = {
      now,
      sponsorFirstName: profile.first_name || profile.username || 'Leader',
      dashboard: d
        ? {
            activeToday: d.activeToday,
            newRegistrationsMonth: d.newRegistrationsMonth,
            openFollowups: d.openFollowups,
            teamAp: d.teamAp,
            teamSize: d.teamSize,
            directCount: d.directCount,
            inactive14d: d.inactive14d,
            tasksDoneToday: d.tasksDoneToday,
            icpMonth: d.icpMonth,
            myApTotal: d.myApTotal,
          }
        : null,
      partners,
      contacts: contactRows,
      warnings: (warnings.data ?? []).map((w) => ({
        kind: w.kind,
        membershipId: w.membershipId,
        name: w.name,
        title: w.title,
        action: w.action,
      })),
      insights: (insights.data ?? []).map((i) => ({
        kind: i.kind,
        emoji: i.emoji,
        title: i.title,
        membershipId: i.membershipId,
        name: i.name,
        detail: i.detail,
      })),
      teamLeader: tl.data
        ? {
            activeFirstlines: tl.data.activeFirstlines,
            requiredFirstlines: tl.data.requiredFirstlines,
            qualified: tl.data.qualified,
          }
        : null,
      pendingShareProofs: listPendingShareVerifications().length,
      planPendingCount: (cachedPlan?.items ?? []).filter((i) => i.status === 'pending').length,
      planDoneCount: (cachedPlan?.items ?? []).filter((i) => i.status === 'done').length,
    };

    return buildCoachOrgIntelligence(input);
  }, [
    enabled,
    profile,
    queryClient,
    dash.data,
    insights.data,
    warnings.data,
    tree.data,
    tl.data,
    contacts.data,
  ]);

  const isLoading =
    enabled && (dash.isPending || tree.isPending || contacts.isPending) && !intelligence;

  return {
    intelligence,
    isMorning: isMorningWindow(new Date()),
    isLoading,
  };
}

/** Resolve person insight for a membership id (genealogy can adopt later). */
export function findPersonInsight(
  intelligence: CoachOrgIntelligence | null,
  membershipId: string | null | undefined
) {
  if (!intelligence || !membershipId) return null;
  return intelligence.personInsights.find((p) => p.membershipId === membershipId) ?? null;
}
