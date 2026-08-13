import { useQuery } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import {
  parseOrgBranding,
  resolveOrgDisplayName,
  resolveOrgGuideUrl,
  resolveOnboardingToolUrl,
  resolveCoachDisplayName,
  type OrgBranding,
} from './orgBranding';
import type { ExternalTool } from '@shared/types/domain';

export interface ActiveOrganizationProfile {
  id: string;
  name: string;
  displayName: string;
  coachDisplayName: string | null;
  branding: OrgBranding;
  guideUrl: string | null;
  onboardingUrl: string | null;
  tools: ExternalTool[];
}

export function useExternalToolsForActiveOrg() {
  const { membership } = useAuth();
  const orgId = membership?.org_id ?? null;
  return useQuery({
    queryKey: ['external-tools', orgId],
    enabled: Boolean(orgId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ExternalTool[]> => {
      const { data, error } = await supabase.from('external_tools').select('*').order('sort_order');
      if (error) throw error;
      return (data ?? []) as ExternalTool[];
    },
  });
}

export function useActiveOrganizationProfile() {
  const { membership } = useAuth();
  const orgId = membership?.org_id ?? null;
  const toolsQuery = useExternalToolsForActiveOrg();

  const orgQuery = useQuery({
    queryKey: ['organization-profile', orgId],
    enabled: Boolean(orgId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, branding')
        .eq('id', orgId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const branding = parseOrgBranding(orgQuery.data?.branding);
  const tools = toolsQuery.data ?? [];
  const profile: ActiveOrganizationProfile | null =
    orgId && orgQuery.data
      ? {
          id: orgQuery.data.id,
          name: orgQuery.data.name,
          displayName: resolveOrgDisplayName(orgQuery.data.name, branding),
          coachDisplayName: resolveCoachDisplayName(branding),
          branding,
          guideUrl: resolveOrgGuideUrl(branding, tools),
          onboardingUrl: resolveOnboardingToolUrl(tools),
          tools,
        }
      : null;

  return {
    orgId,
    profile,
    isPending: Boolean(orgId) && (orgQuery.isPending || toolsQuery.isPending),
    isError: orgQuery.isError || toolsQuery.isError,
  };
}
