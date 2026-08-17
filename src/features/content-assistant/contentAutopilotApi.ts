import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';

export interface AutopilotSettings {
  id: string;
  enabled: boolean;
  paused: boolean;
  timezone: string;
  max_feed_per_day: number;
  max_stories_per_day: number;
  publishing_mode?: 'stories' | 'feed' | 'full' | 'marked_stories';
  min_eligible_assets: number;
  consent_confirmed_at: string | null;
  last_activated_at: string | null;
}

export interface AutopilotSlot {
  id: string;
  draft_id: string | null;
  asset_id: string | null;
  planned_for: string;
  slot_kind: 'feed' | 'story';
  content_format: 'story' | 'feed' | 'reel';
  theme: string | null;
  category: string | null;
  selection_reason: string | null;
  status: string;
  error_message: string | null;
  published_at: string | null;
  retry_count: number;
}

export interface AutopilotState {
  settings: AutopilotSettings | null;
  instagramConnected: boolean;
  instagramStatus?: 'ok' | 'instagram_not_connected' | 'instagram_expired';
  eligibility: {
    ok?: boolean;
    count: number;
    minRequired: number;
    personal: number;
    central: number;
    total: number;
    maxFeedPerDay: number;
    maxStoriesPerDay: number;
    publishingMode?: string;
    markedStoriesManual?: boolean;
    reason?: string;
  };
  plan: {
    id: string;
    period_start: string;
    period_end: string;
    status: string;
    summary: string | null;
  } | null;
  slots: AutopilotSlot[];
  stats: {
    feedPlanned: number;
    feedPublished: number;
    storiesPlanned: number;
    storiesPublished: number;
    skipped: number;
    failed: number;
    todayFeed: number;
    todayStories: number;
  };
  nextSlot: AutopilotSlot | null;
}

async function invokeAutopilot(action: string, extra?: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('content-autopilot', {
    body: { action, ...extra },
  });
  if (error) {
    const ctx = error as { context?: Response; message?: string };
    let detail = ctx.message ?? 'autopilot_failed';
    try {
      if (ctx.context) {
        const body = (await ctx.context.json()) as { error?: string; message?: string };
        detail = body.error ?? body.message ?? detail;
      }
    } catch {
      /* keep */
    }
    throw new Error(detail);
  }
  const payload = data as AutopilotState & { ok?: boolean; error?: string };
  if (payload?.error && payload.ok === false) throw new Error(payload.error);
  return payload;
}

export function useContentAutopilot() {
  const { membership } = useAuth();
  const qc = useQueryClient();
  const orgId = membership?.org_id ?? null;
  const membershipId = membership?.id ?? null;

  const stateQuery = useQuery({
    queryKey: ['content-autopilot', orgId, membershipId],
    enabled: Boolean(orgId && membershipId),
    queryFn: async () => {
      const res = await invokeAutopilot('get_state');
      return res as AutopilotState;
    },
    refetchInterval: 60_000,
  });

  const applyState = async (data: AutopilotState) => {
    qc.setQueryData(['content-autopilot', orgId, membershipId], data);
    await qc.invalidateQueries({ queryKey: ['content-drafts'] });
    await qc.invalidateQueries({ queryKey: ['content-assets'] });
  };

  const activateMutation = useMutation({
    mutationFn: async (prefs?: { publishingMode?: string; maxStoriesPerDay?: number }) => {
      await invokeAutopilot('activate', prefs);
      return invokeAutopilot('get_state');
    },
    onSuccess: applyState,
  });
  const pauseMutation = useMutation({
    mutationFn: async () => {
      await invokeAutopilot('pause');
      return invokeAutopilot('get_state');
    },
    onSuccess: applyState,
  });
  const resumeMutation = useMutation({
    mutationFn: async (prefs?: { publishingMode?: string; maxStoriesPerDay?: number }) => {
      await invokeAutopilot('resume', prefs);
      return invokeAutopilot('get_state');
    },
    onSuccess: applyState,
  });
  const deactivateMutation = useMutation({
    mutationFn: async () => {
      await invokeAutopilot('deactivate');
      return invokeAutopilot('get_state');
    },
    onSuccess: applyState,
  });
  const replanMutation = useMutation({
    mutationFn: async (prefs?: { publishingMode?: string; maxStoriesPerDay?: number }) => {
      await invokeAutopilot('replan', prefs);
      return invokeAutopilot('get_state');
    },
    onSuccess: applyState,
  });
  const updateSettingsMutation = useMutation({
    mutationFn: async (patch: { publishingMode?: string; maxStoriesPerDay?: number }) => {
      await invokeAutopilot('update_settings', patch);
      return invokeAutopilot('get_state');
    },
    onSuccess: applyState,
  });

  return {
    stateQuery,
    activateMutation,
    pauseMutation,
    resumeMutation,
    deactivateMutation,
    replanMutation,
    updateSettingsMutation,
  };
}
