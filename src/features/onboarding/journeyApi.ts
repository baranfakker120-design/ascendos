import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import type { Journey, JourneyStep, UserProgress } from '@shared/types/domain';

export interface JourneyState {
  journey: Journey | null;
  steps: JourneyStep[];
  completedStepIds: Set<string>;
  /** niedrigster Tag mit offenen Schritten; > Tagesmax = alles fertig */
  currentDay: number;
  totalDays: number;
  isComplete: boolean;
}

/**
 * Journey-Zustand des Nutzers. Ist eine aktive Journey unvollständig,
 * übernimmt sie den Heute-Tab (Entscheidung in app/router: TodayRoute).
 */
export function useJourneyState() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['journey-state', profile?.id],
    enabled: !!profile,
    queryFn: async (): Promise<JourneyState> => {
      const journeys = await supabase
        .from('journeys')
        .select('*')
        .order('created_at')
        .limit(1);
      if (journeys.error) throw journeys.error;
      const journey = journeys.data[0] ?? null;
      if (!journey) {
        return {
          journey: null, steps: [], completedStepIds: new Set(),
          currentDay: 1, totalDays: 0, isComplete: true,
        };
      }
      const [steps, progress] = await Promise.all([
        supabase
          .from('journey_steps')
          .select('*')
          .eq('journey_id', journey.id)
          .order('day_number')
          .order('step_order'),
        supabase.from('user_progress').select('*').eq('user_id', profile!.id),
      ]);
      if (steps.error) throw steps.error;
      if (progress.error) throw progress.error;

      const completedStepIds = new Set(
        (progress.data as UserProgress[]).map((p) => p.step_id)
      );
      const totalDays = Math.max(...steps.data.map((s) => s.day_number), 0);
      const firstOpen = steps.data.find((s) => !completedStepIds.has(s.id));
      const currentDay = firstOpen ? firstOpen.day_number : totalDays + 1;

      return {
        journey,
        steps: steps.data,
        completedStepIds,
        currentDay,
        totalDays,
        isComplete: steps.data.length > 0 && !firstOpen,
      };
    },
  });
}

export function useCompleteStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stepId: string) => {
      const { error } = await supabase.rpc('complete_journey_step', { p_step_id: stepId });
      if (error) throw error;
      // Meilensteine direkt prüfen (idempotent) — z. B. „Startklar".
      await supabase.rpc('check_achievements').then(
        () => undefined,
        () => undefined
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['journey-state'] });
      void qc.invalidateQueries({ queryKey: ['progression'] });
    },
  });
}
