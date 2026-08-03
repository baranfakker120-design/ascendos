import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import type {
  ApTaskDef,
  LeaderboardEntry,
  LeaderboardPeriod,
  LeaderboardSort,
  LeaderDashboard,
  QualificationProgress,
  SmartWarning,
  TeamInsight,
  TeamLeaderProgress,
} from './types';

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function mapDashboard(raw: Record<string, unknown>): LeaderDashboard {
  const teamTasks = Array.isArray(raw.tasks_done_by_team_today)
    ? (raw.tasks_done_by_team_today as Array<Record<string, unknown>>)
    : [];
  return {
    activeToday: num(raw.active_today),
    newRegistrationsMonth: num(raw.new_registrations_month),
    newCustomersMonth: num(raw.new_customers_month),
    openFollowups: num(raw.open_followups),
    teamAp: num(raw.team_ap),
    teamSize: num(raw.team_size),
    directCount: num(raw.direct_count),
    inactive14d: num(raw.inactive_14d),
    tasksDoneToday: num(raw.tasks_done_today),
    icpMonth: num(raw.icp_month),
    monthGoalAp: num(raw.month_goal_ap, 2500),
    goalProgress: num(raw.goal_progress),
    myApTotal: num(raw.my_ap_total),
    tasksDoneByTeamToday: teamTasks.map((t) => ({
      membershipId: String(t.membership_id ?? ''),
      name: String(t.name ?? ''),
      ap: num(t.ap),
      tasks: num(t.tasks),
    })),
  };
}

export function useLeaderDashboard() {
  const { membership } = useAuth();
  return useQuery({
    queryKey: ['leader-dashboard', membership?.id],
    enabled: !!membership,
    staleTime: 20_000,
    queryFn: async (): Promise<LeaderDashboard> => {
      const { data, error } = await supabase.rpc('get_leader_dashboard');
      if (error) throw error;
      return mapDashboard((data ?? {}) as Record<string, unknown>);
    },
  });
}

export function useTeamLeaderboard(period: LeaderboardPeriod, sort: LeaderboardSort) {
  const { membership } = useAuth();
  return useQuery({
    queryKey: ['team-leaderboard', membership?.id, period, sort],
    enabled: !!membership,
    staleTime: 20_000,
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      const { data, error } = await supabase.rpc('get_team_leaderboard', {
        p_period: period,
        p_sort: sort === 'sales' ? 'activity' : sort,
      });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        membershipId: String(row.membership_id),
        identityId: String(row.identity_id),
        firstName: String(row.first_name ?? ''),
        lastName: String(row.last_name ?? ''),
        avatarUrl: (row.avatar_url as string) || null,
        rankLabel: (row.rank_label as string) || null,
        frameAsset: (row.frame_asset as string) || null,
        metric: num(row.metric),
        apTotal: num(row.ap_total),
        directCount: num(row.direct_count),
      }));
    },
  });
}

export function useTeamInsights() {
  const { membership } = useAuth();
  return useQuery({
    queryKey: ['team-insights', membership?.id],
    enabled: !!membership,
    staleTime: 30_000,
    queryFn: async (): Promise<TeamInsight[]> => {
      const { data, error } = await supabase.rpc('get_team_insights');
      if (error) throw error;
      const arr = Array.isArray(data) ? data : [];
      return (arr as Array<Record<string, unknown>>).map((row) => ({
        kind: String(row.kind ?? ''),
        emoji: String(row.emoji ?? ''),
        title: String(row.title ?? ''),
        membershipId: String(row.membership_id ?? ''),
        name: String(row.name ?? ''),
        detail: String(row.detail ?? ''),
      }));
    },
  });
}

export function useSmartWarnings() {
  const { membership } = useAuth();
  return useQuery({
    queryKey: ['smart-warnings', membership?.id],
    enabled: !!membership,
    staleTime: 30_000,
    queryFn: async (): Promise<SmartWarning[]> => {
      const { data, error } = await supabase.rpc('get_smart_warnings');
      if (error) throw error;
      const arr = Array.isArray(data) ? data : [];
      return (arr as Array<Record<string, unknown>>).map((row) => ({
        kind: String(row.kind ?? ''),
        membershipId: String(row.membership_id ?? ''),
        name: String(row.name ?? ''),
        title: String(row.title ?? ''),
        action: String(row.action ?? ''),
      }));
    },
  });
}

export function useTeamLeaderProgress() {
  const { membership } = useAuth();
  return useQuery({
    queryKey: ['team-leader-progress', membership?.id],
    enabled: !!membership,
    staleTime: 15_000,
    queryFn: async (): Promise<TeamLeaderProgress | null> => {
      const { data, error } = await supabase.rpc('get_team_leader_progress', {
        p_membership: membership!.id,
      });
      if (error) throw error;
      const row = (data ?? [])[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        membershipId: String(row.membership_id),
        activeFirstlines: num(row.active_firstlines),
        requiredFirstlines: num(row.required_firstlines, 5),
        qualified: Boolean(row.qualified),
        qualifiedAt: (row.qualified_at as string) || null,
        bonusEntitled: Boolean(row.bonus_entitled),
        bonusPaid: Boolean(row.bonus_paid),
        bonusAmountCents: num(row.bonus_amount_cents, 10000),
      };
    },
  });
}

export function useQualificationProgress() {
  const { membership } = useAuth();
  return useQuery({
    queryKey: ['qualification-progress', membership?.id],
    enabled: !!membership,
    staleTime: 15_000,
    queryFn: async (): Promise<QualificationProgress | null> => {
      const { data, error } = await supabase.rpc('get_qualification_progress', {
        p_membership: membership!.id,
      });
      if (error) throw error;
      const raw = (data ?? {}) as Record<string, unknown>;
      if (!raw.membership_id) return null;
      const current = raw.current_rank as Record<string, unknown> | null;
      const next = raw.next_rank as Record<string, unknown> | null;
      const tl = (raw.team_leader ?? {}) as Record<string, unknown>;
      const rewards = Array.isArray(raw.unlocked_rewards)
        ? (raw.unlocked_rewards as Array<Record<string, unknown>>)
        : [];
      return {
        membershipId: String(raw.membership_id),
        apTotal: num(raw.ap_total),
        currentRank: current
          ? {
              key: String(current.key),
              label: String(current.label),
              thresholdAp: num(current.threshold_ap),
              frameAsset: (current.frame_asset as string) || null,
            }
          : null,
        nextRank: next
          ? {
              key: String(next.key),
              label: String(next.label),
              thresholdAp: num(next.threshold_ap),
              remainingAp: num(next.remaining_ap),
            }
          : null,
        teamLeader: {
          qualified: Boolean(tl.qualified),
          activeFirstlines: num(tl.active_firstlines),
          requiredFirstlines: num(tl.required_firstlines, 5),
          bonusAmountCents: num(tl.bonus_amount_cents, 10000),
          bonusPaid: Boolean(tl.bonus_paid),
          qualifiedAt: (tl.qualified_at as string) || null,
        },
        unlockedRewards: rewards.map((r) => ({
          kind: String(r.kind ?? ''),
          amountCents: num(r.amount_cents),
          note: (r.note as string) || null,
        })),
      };
    },
  });
}

export function useApTasks() {
  const { membership } = useAuth();
  return useQuery({
    queryKey: ['ap-tasks', membership?.id],
    enabled: !!membership,
    staleTime: 60_000,
    queryFn: async (): Promise<ApTaskDef[]> => {
      const { data, error } = await supabase.rpc('list_ap_tasks');
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        key: String(row.key),
        title: String(row.title),
        description: (row.description as string) || null,
        category: String(row.category ?? ''),
        difficulty: String(row.difficulty ?? ''),
        ap: num(row.ap),
        repeatable: Boolean(row.repeatable),
        cooldownHours: row.cooldown_hours == null ? null : num(row.cooldown_hours),
        sortOrder: num(row.sort_order),
      }));
    },
  });
}

export function useCompleteApTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { taskKey: string; note?: string }) => {
      const { data, error } = await supabase.rpc('complete_ap_task', {
        p_task_key: input.taskKey,
        p_note: input.note ?? undefined,
      });
      if (error) throw error;
      const row = (data ?? [])[0] as Record<string, unknown> | undefined;
      return {
        completionId: String(row?.completion_id ?? ''),
        apAwarded: num(row?.ap_awarded),
        newApTotal: num(row?.new_ap_total),
      };
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['leader-dashboard'] }),
        qc.invalidateQueries({ queryKey: ['genealogy-tree'] }),
        qc.invalidateQueries({ queryKey: ['qualification-progress'] }),
        qc.invalidateQueries({ queryKey: ['team-leaderboard'] }),
        qc.invalidateQueries({ queryKey: ['ap-tasks'] }),
      ]);
    },
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (targetMembershipId: string) => {
      const { data, error } = await supabase.rpc('toggle_leadership_favorite', {
        p_target_membership: targetMembershipId,
      });
      if (error) throw error;
      return Boolean(data);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['genealogy-tree'] });
    },
  });
}

export function useUpsertLeadershipNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { targetMembershipId: string; body: string }) => {
      const { data, error } = await supabase.rpc('upsert_leadership_note', {
        p_target_membership: input.targetMembershipId,
        p_body: input.body,
      });
      if (error) throw error;
      return String(data);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['leadership-note'] });
    },
  });
}

export function useLeadershipNote(targetMembershipId: string | null) {
  const { membership } = useAuth();
  return useQuery({
    queryKey: ['leadership-note', membership?.id, targetMembershipId],
    enabled: !!membership && !!targetMembershipId,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from('leadership_notes')
        .select('body')
        .eq('owner_membership_id', membership!.id)
        .eq('target_membership_id', targetMembershipId!)
        .maybeSingle();
      if (error) throw error;
      return data?.body ?? '';
    },
  });
}
