import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
}

export type ProfileUpdateInput = {
  first_name: string;
  last_name: string;
  phone: string | null;
  country: string | null;
  language: string;
};

/** Aktives Profil inkl. Kontext und Rang — Rank über DB-RPCs, AP über memberships. */
export function useProfileDetail() {
  const { profile: authProfile } = useAuth();
  return useQuery({
    queryKey: ['profile-detail', authProfile?.id],
    enabled: !!authProfile,
    queryFn: async (): Promise<ProfileDetail> => {
      const userId = authProfile!.id;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (profileError) throw profileError;

      const [team, org, sponsor, membership] = await Promise.all([
        supabase.from('teams').select('name').eq('id', profile.team_id).single(),
        supabase.from('organizations').select('name').eq('id', profile.org_id).single(),
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
          .eq('org_id', profile.org_id)
          .eq('status', 'active')
          .maybeSingle(),
      ]);

      if (team.error) throw team.error;
      if (org.error) throw org.error;
      if (sponsor.error) throw sponsor.error;
      if (membership.error) throw membership.error;

      const apTotal = membership.data?.ap_total ?? 0;
      const orgId = membership.data?.org_id ?? profile.org_id;
      const membershipId = membership.data?.id ?? null;
      const teamLeaderQualified = !!membership.data?.team_leader_qualified_at;

      // Erster Tag des laufenden Monats (UTC) — entspricht monthly_awards.period.
      const now = new Date();
      const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
        .toISOString()
        .slice(0, 10);

      // Display rank is qualification-aware (Team Leader frame only when qualified).
      const [currentRank, nextRank, monthlyAward, cosmetics] = await Promise.all([
        supabase.rpc('display_rank_for_ap', {
          p_org: orgId,
          p_ap: apTotal,
          p_team_leader_qualified: teamLeaderQualified,
        }),
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
      if (currentRank.error) throw currentRank.error;
      if (nextRank.error) throw nextRank.error;
      if (monthlyAward.error) throw monthlyAward.error;
      if (cosmetics.error) throw cosmetics.error;

      const equippedPath =
        ((cosmetics.data ?? []) as Array<{ asset_path: string; is_equipped: boolean }>).find(
          (row) => row.is_equipped
        )?.asset_path ?? null;

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
          current: currentRank.data?.[0] ?? null,
          next: nextRank.data?.[0] ?? null,
          isBeraterDesMonats: !!monthlyAward.data,
          equippedFrameKey: equippedPath,
          teamLeaderQualified,
        },
      };
    },
  });
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
