import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  isMissingRelationError,
  isMissingRpcError,
  isOrgMismatchRpcError,
} from '@shared/api/rpcErrors';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import { runOrEnqueue } from '@shared/offline';
import type { Membership, NextRankForAp, Profile, RankForAp } from '@shared/types/domain';

export const AVATAR_BUCKET = 'avatare';
export const AVATAR_OBJECT_NAME = 'avatar.webp';

export interface ProfileContext {
  teamName: string;
  orgName: string;
  sponsorName: string | null;
}

export interface ProfileRankState {
  apTotal: number;
  membershipId: string | null;
  current: RankForAp | null;
  next: NextRankForAp | null;
  /** Monatlicher Award Platz 1 im laufenden Monat — Sonderrahmen frame-10. */
  isBeraterDesMonats: boolean;
  /** Equipped cosmetic frame asset_path (AP/special), if any. */
  equippedFrameKey: string | null;
  /** Team Leader firstline qualification — gates frame-06. */
  teamLeaderQualified: boolean;
}

export interface ProfileDetail {
  profile: Profile;
  context: ProfileContext;
  rank: ProfileRankState;
  /**
   * Non-fatal enrichment failure (rank display / cosmetics / awards).
   * UI keeps the full profile layout and shows an inline banner.
   */
  loadWarning: string | null;
}

export type ProfileUpdateInput = {
  first_name: string;
  last_name: string;
  phone: string | null;
  country: string | null;
  language: string;
};

type RpcResult<T> = { data: T | null; error: unknown };

/** Soft-fail Sprint 6 display rank; fall back to classic rank_for_ap. */
export async function resolveCurrentRank(args: {
  orgId: string;
  apTotal: number;
  teamLeaderQualified: boolean;
  displayRank: () => Promise<RpcResult<RankForAp[]>>;
  classicRank: () => Promise<RpcResult<RankForAp[]>>;
}): Promise<{ current: RankForAp | null; warning: string | null }> {
  const display = await args.displayRank();
  if (!display.error) {
    return { current: display.data?.[0] ?? null, warning: null };
  }

  const soft =
    isMissingRpcError(display.error) || isOrgMismatchRpcError(display.error);
  if (!soft) {
    throw display.error;
  }

  const classic = await args.classicRank();
  if (classic.error) throw classic.error;
  return {
    current: classic.data?.[0] ?? null,
    warning: 'display_rank_unavailable',
  };
}

function emptyRank(apTotal = 0): ProfileRankState {
  return {
    apTotal,
    membershipId: null,
    current: null,
    next: null,
    isBeraterDesMonats: false,
    equippedFrameKey: null,
    teamLeaderQualified: false,
  };
}

/** Aktives Profil inkl. Kontext und Rang — Rank über DB-RPCs, AP über memberships. */
export function useProfileDetail() {
  const { profile: authProfile, membership: activeMembership } = useAuth();
  return useQuery({
    queryKey: ['profile-detail', authProfile?.id, activeMembership?.org_id ?? null],
    enabled: !!authProfile,
    queryFn: async (): Promise<ProfileDetail> => {
      const userId = authProfile!.id;
      // Bind to active membership org (x-ascendos-org / current_org_id), not the
      // profiles.org_id mirror — mismatch breaks display_rank_for_ap for Developers.
      const preferredOrgId = activeMembership?.org_id ?? authProfile!.org_id;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (profileError) throw profileError;

      const teamId = activeMembership?.team_id ?? profile.team_id;

      const [team, org, sponsor, membership] = await Promise.all([
        supabase.from('teams').select('name').eq('id', teamId).single(),
        supabase.from('organizations').select('name').eq('id', preferredOrgId).single(),
        profile.sponsor_id
          ? supabase
              .from('profiles_public')
              .select('first_name, last_name')
              .eq('id', profile.sponsor_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from('memberships')
          .select('id, ap_total, org_id, status, team_leader_qualified_at')
          .eq('identity_id', userId)
          .eq('org_id', preferredOrgId)
          .eq('status', 'active')
          .maybeSingle(),
      ]);

      if (team.error) throw team.error;
      if (org.error) throw org.error;
      if (sponsor.error) throw sponsor.error;
      if (membership.error) throw membership.error;

      const apTotal = membership.data?.ap_total ?? activeMembership?.ap_total ?? 0;
      const orgId = membership.data?.org_id ?? preferredOrgId;
      const membershipId = membership.data?.id ?? activeMembership?.id ?? null;
      const teamLeaderQualified =
        !!membership.data?.team_leader_qualified_at ||
        !!activeMembership?.team_leader_qualified_at;

      // Erster Tag des laufenden Monats (UTC) — entspricht monthly_awards.period.
      const now = new Date();
      const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
        .toISOString()
        .slice(0, 10);

      let loadWarning: string | null = null;

      const { current, warning: rankWarning } = await resolveCurrentRank({
        orgId,
        apTotal,
        teamLeaderQualified,
        displayRank: async () =>
          supabase.rpc('display_rank_for_ap', {
            p_org: orgId,
            p_ap: apTotal,
            p_team_leader_qualified: teamLeaderQualified,
          }),
        classicRank: async () =>
          supabase.rpc('rank_for_ap', { p_org_id: orgId, p_ap: apTotal }),
      });
      if (rankWarning) loadWarning = rankWarning;

      const [nextRank, monthlyAward, cosmetics] = await Promise.all([
        supabase.rpc('next_rank_for_ap', { p_org_id: orgId, p_ap: apTotal }),
        membershipId
          ? supabase
              .from('monthly_awards')
              .select('id')
              .eq('org_id', orgId)
              .eq('membership_id', membershipId)
              .eq('period', period)
              .eq('place', 1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        membershipId
          ? supabase.rpc('list_my_frame_cosmetics')
          : Promise.resolve({ data: null, error: null }),
      ]);

      let next: NextRankForAp | null = null;
      if (nextRank.error) {
        // Classic RPC — keep profile alive if enrichment fails.
        loadWarning = loadWarning ?? 'next_rank_unavailable';
      } else {
        next = nextRank.data?.[0] ?? null;
      }

      let isBeraterDesMonats = false;
      if (monthlyAward.error) {
        if (
          isMissingRelationError(monthlyAward.error) ||
          isMissingRpcError(monthlyAward.error)
        ) {
          loadWarning = loadWarning ?? 'monthly_awards_unavailable';
        } else {
          // RLS / unexpected: still do not wipe the profile shell.
          loadWarning = loadWarning ?? 'monthly_awards_unavailable';
        }
      } else {
        isBeraterDesMonats = !!monthlyAward.data;
      }

      let equippedFrameKey: string | null = null;
      if (cosmetics.error) {
        if (
          isMissingRpcError(cosmetics.error) ||
          isMissingRelationError(cosmetics.error)
        ) {
          loadWarning = loadWarning ?? 'cosmetics_unavailable';
        } else {
          loadWarning = loadWarning ?? 'cosmetics_unavailable';
        }
      } else {
        equippedFrameKey =
          ((cosmetics.data ?? []) as Array<{ asset_path: string; is_equipped: boolean }>).find(
            (row) => row.is_equipped
          )?.asset_path ?? null;
      }

      return {
        profile,
        context: {
          teamName: team.data?.name ?? '—',
          orgName: org.data?.name ?? '—',
          sponsorName: sponsor.data
            ? `${sponsor.data.first_name} ${sponsor.data.last_name}`.trim()
            : null,
        },
        rank: {
          apTotal,
          membershipId,
          current,
          next,
          isBeraterDesMonats,
          equippedFrameKey,
          teamLeaderQualified,
        },
        loadWarning,
      };
    },
  });
}

/** Shell detail from auth when the profile-detail query fails entirely. */
export function profileDetailFromAuth(
  profile: Profile,
  membership: Membership | null
): ProfileDetail {
  return {
    profile,
    context: {
      teamName: '—',
      orgName: '—',
      sponsorName: null,
    },
    rank: emptyRank(membership?.ap_total ?? 0),
    loadWarning: 'profile_partial',
  };
}

/** Erlaubte Identitätsfelder speichern (username/role/org/team/sponsor bleiben unberührt). */
export function useUpdateProfile() {
  const { profile, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProfileUpdateInput): Promise<Profile> => {
      if (!profile) throw new Error('Nicht angemeldet.');
      const patch = {
        first_name: input.first_name,
        last_name: input.last_name,
        phone: input.phone,
        country: input.country,
        language: input.language,
      };
      const result = await runOrEnqueue({
        type: 'profile_update',
        dedupeKey: `profile:${profile.id}`,
        payload: { id: profile.id, patch },
        execute: async () => {
          const { data, error } = await supabase
            .from('profiles')
            .update(patch)
            .eq('id', profile.id)
            .select('*')
            .single();
          if (error) throw error;
          return data;
        },
      });
      if (result.status === 'synced') return result.data;
      return {
        ...profile,
        ...patch,
      };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile-detail', profile?.id] }),
        refreshProfile(),
      ]);
    },
  });
}

/** Öffentliche URL für ein Avatar-Objekt im Bucket avatare. */
export function publicAvatarUrl(userId: string): string {
  const { data } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(`${userId}/${AVATAR_OBJECT_NAME}`);
  return data.publicUrl;
}

/**
 * Lädt ein fertiges Bild in Storage und schreibt profiles.avatar_url.
 * Zuschneiden/Komprimieren bleibt in AvatarUpload (Browser) —
 * keine Geschäftslogik, nur Dateitransport.
 */
export async function uploadAvatarImage(userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/${AVATAR_OBJECT_NAME}`;
  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, {
    upsert: true,
    contentType: 'image/webp',
    cacheControl: '3600',
  });
  if (uploadError) throw uploadError;

  // Cache-Buster: gleiche URL würde sonst ein altes Bild zeigen.
  const url = `${publicAvatarUrl(userId)}?v=${Date.now()}`;
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: url })
    .eq('id', userId);
  if (updateError) throw updateError;
  return url;
}

/** Hilfstyp für Tests / interne Nutzung. */
export type ActiveMembershipSlice = Pick<Membership, 'id' | 'ap_total' | 'org_id' | 'status'>;
