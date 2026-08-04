import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isMissingRpcError } from '@shared/api/rpcErrors';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import { runOrEnqueue } from '@shared/offline';
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

const EMPTY_DASH: LeaderDashboard = {
  activeToday: 0,
  newRegistrationsMonth: 0,
  newCustomersMonth: 0,
  openFollowups: 0,
  teamAp: 0,
  teamSize: 0,
  directCount: 0,
  inactive14d: 0,
  tasksDoneToday: 0,
  icpMonth: 0,
  monthGoalAp: 2500,
  goalProgress: 0,
  myApTotal: 0,
  tasksDoneByTeamToday: [],
};

/** Soft-fail optional leadership RPCs: missing schema → empty, never crash the page. */
async function softRpcJson(
  name:
    | 'get_leader_dashboard'
    | 'get_team_insights'
    | 'get_smart_warnings'
    | 'get_team_leaderboard'
    | 'get_team_leader_progress'
    | 'get_qualification_progress'
    | 'list_ap_tasks',
  args?: Record<string, unknown>
): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(name, args);
  if (!error) return data;
  if (isMissingRpcError(error)) return null;
  throw error;
}

export function useLeaderDashboard() {
  const { membership } = useAuth();
  return useQuery({
    queryKey: ['leader-dashboard', membership?.id],
    enabled: !!membership,
    staleTime: 20_000,
    queryFn: async (): Promise<LeaderDashboard> => {
      const data = await softRpcJson('get_leader_dashboard');
      if (data == null) {
        return { ...EMPTY_DASH, myApTotal: membership?.ap_total ?? 0 };
      }
      return mapDashboard(data as Record<string, unknown>);
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
      if (error) {
        if (isMissingRpcError(error)) return [];
        throw error;
      }
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
      if (error) {
        if (isMissingRpcError(error)) return [];
        throw error;
      }
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
      if (error) {
        if (isMissingRpcError(error)) return [];
        throw error;
      }
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
      if (error) {
        if (isMissingRpcError(error)) {
          return {
            membershipId: membership!.id,
            activeFirstlines: 0,
            requiredFirstlines: 5,
            qualified: false,
            qualifiedAt: null,
            bonusEntitled: false,
            bonusPaid: false,
            bonusAmountCents: 10000,
          };
        }
        throw error;
      }
      const row = (data ?? [])[0] as Record<string, unknown> | undefined;
      if (!row) {
        return {
          membershipId: membership!.id,
          activeFirstlines: 0,
          requiredFirstlines: 5,
          qualified: false,
          qualifiedAt: null,
          bonusEntitled: false,
          bonusPaid: false,
          bonusAmountCents: 10000,
        };
      }
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

async function loadQualificationFallback(
  membershipId: string,
  apTotal: number
): Promise<QualificationProgress> {
  const { data: ranks } = await supabase
    .from('ranks')
    .select('key, label, threshold_ap, frame_asset')
    .eq('is_active', true)
    .order('threshold_ap', { ascending: true });

  const list = (ranks ?? []) as Array<{
    key: string;
    label: string;
    threshold_ap: number;
    frame_asset: string | null;
  }>;
  const current =
    [...list].reverse().find((r) => r.threshold_ap <= apTotal && r.key !== 'team_leader') ??
    list[0] ??
    null;
  const next = list.find((r) => r.threshold_ap > apTotal) ?? null;

  let activeFirstlines = 0;
  const { data: directs } = await supabase
    .from('memberships')
    .select('id')
    .eq('sponsor_membership_id', membershipId)
    .eq('status', 'active');
  activeFirstlines = directs?.length ?? 0;

  return {
    membershipId,
    apTotal,
    currentRank: current
      ? {
          key: current.key,
          label: current.label,
          thresholdAp: current.threshold_ap,
          frameAsset: current.frame_asset,
        }
      : null,
    nextRank: next
      ? {
          key: next.key,
          label: next.label,
          thresholdAp: next.threshold_ap,
          remainingAp: Math.max(0, next.threshold_ap - apTotal),
        }
      : null,
    teamLeader: {
      qualified: false,
      activeFirstlines,
      requiredFirstlines: 5,
      bonusAmountCents: 10000,
      bonusPaid: false,
      qualifiedAt: null,
    },
    unlockedRewards: [],
  };
}

function mapQualification(
  raw: Record<string, unknown>,
  fallbackMembershipId: string
): QualificationProgress {
  const current = raw.current_rank as Record<string, unknown> | null;
  const next = raw.next_rank as Record<string, unknown> | null;
  const tl = (raw.team_leader ?? {}) as Record<string, unknown>;
  const rewards = Array.isArray(raw.unlocked_rewards)
    ? (raw.unlocked_rewards as Array<Record<string, unknown>>)
    : [];
  return {
    membershipId: String(raw.membership_id ?? fallbackMembershipId),
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
}

export function useQualificationProgress() {
  const { membership } = useAuth();
  return useQuery({
    queryKey: ['qualification-progress', membership?.id],
    enabled: !!membership,
    staleTime: 15_000,
    queryFn: async (): Promise<QualificationProgress> => {
      const { data, error } = await supabase.rpc('get_qualification_progress', {
        p_membership: membership!.id,
      });
      if (error) {
        if (isMissingRpcError(error)) {
          return loadQualificationFallback(membership!.id, membership!.ap_total ?? 0);
        }
        throw error;
      }
      const raw = (data ?? {}) as Record<string, unknown>;
      if (!raw.membership_id) {
        return loadQualificationFallback(membership!.id, membership!.ap_total ?? 0);
      }
      return mapQualification(raw, membership!.id);
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
      if (error) {
        if (isMissingRpcError(error)) return [];
        throw error;
      }
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
      const result = await runOrEnqueue({
        type: 'leadership_note',
        dedupeKey: `note:${input.targetMembershipId}`,
        payload: input,
        execute: async () => {
          const { data, error } = await supabase.rpc('upsert_leadership_note', {
            p_target_membership: input.targetMembershipId,
            p_body: input.body,
          });
          if (error) throw error;
          return String(data);
        },
      });
      return result.status === 'synced' ? result.data : undefined;
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
      if (error) {
        if (isMissingRpcError(error) || error.code === '42P01' || error.code === 'PGRST205') {
          return '';
        }
        throw error;
      }
      return data?.body ?? '';
    },
  });
}
