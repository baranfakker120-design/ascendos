import { useQuery } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import type { GenealogyNode, GenealogyRole } from './types';

interface RpcRow {
  membership_id: string;
  identity_id: string;
  sponsor_membership_id: string | null;
  depth: number;
  first_name: string;
  last_name: string;
  username: string;
  avatar_url: string | null;
  phone: string | null;
  role: string;
  ap_total: number;
  rank_key: string | null;
  rank_label: string | null;
  frame_asset: string | null;
  direct_count: number;
  team_count: number;
  last_app_opened_at: string | null;
  is_berater_des_monats: boolean;
  joined_at: string;
}

function mapRow(row: RpcRow): GenealogyNode {
  return {
    membershipId: row.membership_id,
    identityId: row.identity_id,
    sponsorMembershipId: row.sponsor_membership_id,
    depth: row.depth,
    firstName: row.first_name,
    lastName: row.last_name,
    username: row.username,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    role: row.role as GenealogyRole,
    apTotal: row.ap_total,
    rankKey: row.rank_key,
    rankLabel: row.rank_label,
    frameAsset: row.frame_asset,
    directCount: row.direct_count,
    teamCount: row.team_count,
    lastAppOpenedAt: row.last_app_opened_at,
    isBeraterDesMonats: row.is_berater_des_monats,
    joinedAt: row.joined_at,
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
