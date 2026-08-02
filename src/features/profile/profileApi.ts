import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import type {
  Membership,
  NextRankForAp,
  Profile,
  RankForAp,
} from '@shared/types/domain';

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
          .select('id, ap_total, org_id, status')
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

      // Rangschwellen kommen ausschließlich aus der Datenbank.
      const [currentRank, nextRank] = await Promise.all([
        supabase.rpc('rank_for_ap', { p_org_id: orgId, p_ap: apTotal }),
        supabase.rpc('next_rank_for_ap', { p_org_id: orgId, p_ap: apTotal }),
      ]);
      if (currentRank.error) throw currentRank.error;
      if (nextRank.error) throw nextRank.error;

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
          membershipId: membership.data?.id ?? null,
          current: currentRank.data?.[0] ?? null,
          next: nextRank.data?.[0] ?? null,
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
      const { data, error } = await supabase
        .from('profiles')
        .update({
          first_name: input.first_name,
          last_name: input.last_name,
          phone: input.phone,
          country: input.country,
          language: input.language,
        })
        .eq('id', profile.id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
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
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(`${userId}/${AVATAR_OBJECT_NAME}`);
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
