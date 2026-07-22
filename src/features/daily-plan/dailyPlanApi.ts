import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import type { DailyPlan, DailyPlanItem, MissionStatus } from '@shared/types/domain';

/** Lokales Datum des Nutzers (nicht UTC) — "heute" gilt in seiner Zeitzone. */
export function localDate(): string {
  return new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
}

export interface DailyPlanData {
  plan: DailyPlan;
  items: DailyPlanItem[];
}

/**
 * Holt (oder erzeugt) den heutigen Plan. generate_daily_plan ist
 * idempotent — der Aufruf beim App-Öffnen ist immer sicher.
 */
export function useDailyPlan() {
  const { profile } = useAuth();
  const date = localDate();
  return useQuery({
    queryKey: ['daily-plan', profile?.id, date],
    enabled: !!profile,
    queryFn: async (): Promise<DailyPlanData> => {
      const { data: planId, error: genError } = await supabase.rpc('generate_daily_plan', {
        p_date: date,
      });
      if (genError) throw genError;
      const [plan, items] = await Promise.all([
        supabase.from('daily_plans').select('*').eq('id', planId).single(),
        supabase
          .from('daily_plan_items')
          .select('*')
          .eq('plan_id', planId)
          .order('position'),
      ]);
      if (plan.error) throw plan.error;
      if (items.error) throw items.error;
      return { plan: plan.data, items: items.data };
    },
  });
}

export function useDailyPlanMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['daily-plan'] });
    void qc.invalidateQueries({ queryKey: ['contacts'] });
    void qc.invalidateQueries({ queryKey: ['contact-events'] });
  };

  const commitPlan = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase.rpc('commit_daily_plan', { p_plan_id: planId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setMissionStatus = useMutation({
    mutationFn: async (input: { itemId: string; status: MissionStatus; reason?: string }) => {
      const { error } = await supabase.rpc('update_mission_status', {
        p_item_id: input.itemId,
        p_status: input.status,
        p_reason: input.reason ?? null,
      });
      if (error) throw error;
    },
    // Optimistic Update: der Tap fühlt sich sofort an (Phase 6),
    // die lokale Sortierlogik ordnet ohne Server-Roundtrip neu.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['daily-plan'] });
      const snapshots = qc.getQueriesData<DailyPlanData>({ queryKey: ['daily-plan'] });
      qc.setQueriesData<DailyPlanData>({ queryKey: ['daily-plan'] }, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((i) =>
                i.id === input.itemId
                  ? {
                      ...i,
                      status: input.status,
                      resolved_at:
                        input.status === 'done' || input.status === 'skipped'
                          ? new Date().toISOString()
                          : null,
                    }
                  : i
              ),
            }
          : old
      );
      return { snapshots };
    },
    onError: (_err, _input, ctx) => {
      for (const [key, data] of ctx?.snapshots ?? []) qc.setQueryData(key, data);
    },
    onSettled: invalidate,
  });

  return { commitPlan, setMissionStatus };
}
