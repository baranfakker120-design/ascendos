import { useQuery } from '@tanstack/react-query';
import { isMissingRpcError } from '@shared/api/rpcErrors';
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

/**
 * Compatibility path when get_genealogy_tree is not deployed yet.
 * Uses get_downline + profiles_public — enough for empty/minimal tree UX.
 */
async function loadGenealogyFallback(
  rootIdentityId: string,
  membershipId: string,
  role: string
): Promise<GenealogyNode[]> {
  const { data: downline, error } = await supabase.rpc('get_downline', {
    root_user_id: rootIdentityId,
  });
  if (error) throw error;

  const rows = (downline ?? []) as Array<{ user_id: string; depth: number }>;
  const ids = [rootIdentityId, ...rows.map((r) => r.user_id)];
  const { data: profiles } = await supabase
    .from('profiles_public')
    .select('id, first_name, last_name, username, avatar_url')
    .in('id', ids);

  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  const self = byId.get(rootIdentityId);
  const nodes: GenealogyNode[] = [
    {
      membershipId,
      identityId: rootIdentityId,
      sponsorMembershipId: null,
      depth: 0,
      firstName: self?.first_name ?? '',
      lastName: self?.last_name ?? '',
      username: self?.username ?? '',
      avatarUrl: self?.avatar_url ?? null,
      phone: null,
      role: role as GenealogyRole,
      apTotal: 0,
      rankKey: null,
      rankLabel: null,
      frameAsset: null,
      directCount: rows.filter((r) => r.depth === 1).length,
      teamCount: rows.length,
      lastAppOpenedAt: null,
      isBeraterDesMonats: false,
      joinedAt: new Date(0).toISOString(),
      icpMonth: 0,
      streakDays: 0,
      isFavorite: false,
      sponsorName: null,
      messageBadge: 0,
    },
  ];

  for (const row of rows) {
    const p = byId.get(row.user_id);
    nodes.push({
      membershipId: `fallback-${row.user_id}`,
      identityId: row.user_id,
      sponsorMembershipId: row.depth === 1 ? membershipId : null,
      depth: row.depth,
      firstName: p?.first_name ?? '',
      lastName: p?.last_name ?? '',
      username: p?.username ?? '',
      avatarUrl: p?.avatar_url ?? null,
      phone: null,
      role: 'berater',
      apTotal: 0,
      rankKey: null,
      rankLabel: null,
      frameAsset: null,
      directCount: rows.filter(
        (c) => c.depth === row.depth + 1 /* approximate without sponsor map */
      ).length,
      teamCount: 0,
      lastAppOpenedAt: null,
      isBeraterDesMonats: false,
      joinedAt: new Date(0).toISOString(),
      icpMonth: 0,
      streakDays: 0,
      isFavorite: false,
      sponsorName: null,
      messageBadge: 0,
    });
  }

  return nodes;
}

/**
 * Loads the structure tree.
 * - No / null root → server climbs to the org lineage top (full org view).
 * - Explicit identity → previous downline-from-that-root semantics.
 */
export function useGenealogyTree(rootIdentityId?: string | null) {
  const { profile, membership, role } = useAuth();
  const orgScoped = rootIdentityId === undefined || rootIdentityId === null;
  return useQuery({
    queryKey: ['genealogy-tree', membership?.id, orgScoped ? 'org-root' : rootIdentityId],
    enabled: !!profile && !!membership,
    staleTime: 30_000,
    queryFn: async (): Promise<GenealogyNode[]> => {
      const { data, error } = await supabase.rpc(
        'get_genealogy_tree',
        orgScoped ? {} : { p_root_identity: rootIdentityId! }
      );
      if (!error) {
        return ((data ?? []) as RpcRow[]).map(mapRow);
      }
      if (isMissingRpcError(error)) {
        return loadGenealogyFallback(profile!.id, membership!.id, String(role ?? membership!.role));
      }
      throw error;
    },
  });
}
