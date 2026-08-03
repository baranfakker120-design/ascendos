import { useQuery } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import type { GenealogyNode, GenealogyRole } from './types';

interface RpcRow {
  membership_id: string;
  identity_id: string;
  sponsor_membership_id: string;
  depth: number;
  first_name: string;
  last_name: string;
  username: string;
  avatar_url: string;
  phone: string;
  role: string;
  ap_total: number;
  rank_key: string;
  rank_label: string;
  frame_asset: string;
  direct_count: number;
  team_count: number;
  last_app_opened_at: string;
  is_berater_des_monats: boolean;
  joined_at: string;
  icp_month?: number;
  streak_days?: number;
  is_favorite?: boolean;
  sponsor_name?: string;
  message_badge?: number;
}

function mapRow(row: RpcRow): GenealogyNode {
  return {
    membershipId: row.membership_id,
    identityId: row.identity_id,
    sponsorMembershipId: row.sponsor_membership_id || null,
    depth: row.depth,
    firstName: row.first_name,
    lastName: row.last_name,
    username: row.username,
    avatarUrl: row.avatar_url || null,
    phone: row.phone || null,
    role: row.role as GenealogyRole,
    apTotal: row.ap_total,
    rankKey: row.rank_key || null,
    rankLabel: row.rank_label || null,
    frameAsset: row.frame_asset || null,
    directCount: row.direct_count,
    teamCount: row.team_count,
    lastAppOpenedAt: row.last_app_opened_at || null,
    isBeraterDesMonats: row.is_berater_des_monats,
    joinedAt: row.joined_at,
    icpMonth: row.icp_month ?? 0,
    streakDays: row.streak_days ?? 0,
    isFavorite: Boolean(row.is_favorite),
    sponsorName: row.sponsor_name || null,
    messageBadge: row.message_badge ?? 0,
  };
}

export function useGenealogyTree(rootIdentityId?: string | null) {
  const { profile, membership } = useAuth();
  return useQuery({
    queryKey: ['genealogy-tree', membership?.id, rootIdentityId ?? profile?.id],
    enabled: !!profile && !!membership,
    staleTime: 30_000,
    queryFn: async (): Promise<GenealogyNode[]> => {
      const { data, error } = await supabase.rpc('get_genealogy_tree', {
        p_root_identity: rootIdentityId ?? undefined,
      });
      if (error) throw error;
      return ((data ?? []) as RpcRow[]).map(mapRow);
    },
  });
}
