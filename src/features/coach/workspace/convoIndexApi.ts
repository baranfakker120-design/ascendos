import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';

export type CoachConvoIndexRow = {
  id: string;
  contact_id: string | null;
  created_at: string;
  agent_key: string | null;
};

/** Read-only hydrate of existing server threads into the local workspace. */
export function useCoachConvoIndex(enabled = true) {
  return useQuery({
    queryKey: ['coach-convos-index'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<CoachConvoIndexRow[]> => {
      const { data, error } = await supabase
        .from('coach_convos')
        .select('id, contact_id, created_at, agent_key')
        .order('created_at', { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as CoachConvoIndexRow[];
    },
  });
}

export function useRefreshCoachConvoIndex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await qc.invalidateQueries({ queryKey: ['coach-convos-index'] });
    },
  });
}
