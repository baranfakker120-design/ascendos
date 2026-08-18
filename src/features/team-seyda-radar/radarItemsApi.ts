import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@shared/auth/AuthProvider';
import { supabase } from '@shared/api/supabase';
import { isTeamSeydaRadarOrg, teamSeydaRadarQueryKey } from './teamSeydaRadar';
import type { RadarContentType, RadarSource } from './radarInsertGate';

export const RADAR_UNRESOLVED_LIMIT = 12;

export interface TeamRadarItem {
  id: string;
  source: RadarSource;
  content_type: RadarContentType;
  published_at: string;
  canonical_url: string | null;
  resolved_at: string | null;
}

function isRadarSource(value: string): value is RadarSource {
  return value === 'chogan' || value === 'essence_tribe';
}

function isRadarContentType(value: string): value is RadarContentType {
  return value === 'POST' || value === 'REEL';
}

export function mapRadarItemRow(row: {
  id: string;
  source: string;
  content_type: string;
  published_at: string;
  canonical_url: string | null;
  resolved_at: string | null;
}): TeamRadarItem | null {
  if (!isRadarSource(row.source) || !isRadarContentType(row.content_type)) return null;
  return {
    id: row.id,
    source: row.source,
    content_type: row.content_type,
    published_at: row.published_at,
    canonical_url: row.canonical_url,
    resolved_at: row.resolved_at,
  };
}

export function useRadarItems() {
  const { membership } = useAuth();
  const orgId = membership?.org_id ?? null;
  const enabled = isTeamSeydaRadarOrg(orgId);
  return useQuery({
    queryKey: [...teamSeydaRadarQueryKey(orgId), 'unresolved'],
    enabled,
    queryFn: async (): Promise<TeamRadarItem[]> => {
      const { data, error } = await supabase
        .from('team_radar_items')
        .select('id, source, content_type, published_at, canonical_url, resolved_at')
        .is('resolved_at', null)
        .order('published_at', { ascending: false })
        .limit(RADAR_UNRESOLVED_LIMIT);
      if (error) throw error;
      return (data ?? [])
        .map((row) => mapRadarItemRow(row))
        .filter((row): row is TeamRadarItem => row != null);
    },
    staleTime: 60_000,
  });
}

export function useResolveRadarItem() {
  const qc = useQueryClient();
  const { membership } = useAuth();
  const orgId = membership?.org_id ?? null;
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('team_radar_items')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', id)
        .is('resolved_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: teamSeydaRadarQueryKey(orgId) });
    },
  });
}
