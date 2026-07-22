import { useQuery } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import type { Achievement, UserAchievement } from '@shared/types/domain';

export interface ProgressionData {
  achievements: Achievement[];
  unlockedById: Map<string, string>; // achievement_id -> unlocked_at
  weeklyActiveDays: number;
  followUpsTotal: number;
  contactsTotal: number;
}

/** Progression: echte Meilensteine + rollierendes Wochenfenster (Phase 3:
 *  kein Streak-Reset, keine Punkte — nur echter Fortschritt). */
export function useProgression() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['progression', profile?.id],
    enabled: !!profile,
    queryFn: async (): Promise<ProgressionData> => {
      // Evaluator zuerst (idempotent) — neue Meilensteine erscheinen sofort.
      await supabase.rpc('check_achievements').then(
        () => undefined,
        () => undefined
      );
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [defs, unlocked, opens, followUps, contacts] = await Promise.all([
        supabase.from('achievements').select('*').order('sort_order'),
        supabase.from('user_achievements').select('*'),
        supabase
          .from('usage_events')
          .select('created_at')
          .eq('event_type', 'app_opened')
          .gte('created_at', sevenDaysAgo),
        supabase
          .from('pipeline_events')
          .select('id', { count: 'exact', head: true })
          .eq('event_type', 'follow_up'),
        supabase.from('contacts').select('id', { count: 'exact', head: true }),
      ]);
      if (defs.error) throw defs.error;
      if (unlocked.error) throw unlocked.error;

      const activeDays = new Set(
        (opens.data ?? []).map((o) => o.created_at.slice(0, 10))
      );
      return {
        achievements: defs.data,
        unlockedById: new Map(
          (unlocked.data as UserAchievement[]).map((u) => [u.achievement_id, u.unlocked_at])
        ),
        weeklyActiveDays: activeDays.size,
        followUpsTotal: followUps.count ?? 0,
        contactsTotal: contacts.count ?? 0,
      };
    },
  });
}
