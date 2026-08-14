import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';

export interface PlatformOrgListRow {
  id: string;
  name: string;
  display_name: string;
  status: string;
  created_at: string;
  member_count: number;
  team_count: number;
}

export interface PlatformAdminRow {
  id: string;
  identity_id: string;
  is_active: boolean;
  granted_at: string;
  revoked_at: string | null;
  notes: string | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
}

export interface PlatformOrgDetail {
  organization: {
    id: string;
    name: string;
    branding: Record<string, unknown>;
    settings: Record<string, unknown>;
    status: string;
    created_at: string;
  };
  display_name: string;
  status: string;
  member_count: number;
  team_count: number;
  tool_count: number;
  agent_count: number;
  knowledge_docs: number;
  live_events: number;
  stories: number;
  content_assets: number;
  instagram_connections: number;
  usage_events: number;
  branding_configured: boolean;
}

function rpcErrorMessage(error: { message?: string; code?: string } | null): string {
  const msg = error?.message ?? '';
  if (msg.includes('Keine Plattformberechtigung') || error?.code === '42501') {
    return 'Keine Plattformberechtigung.';
  }
  if (msg.includes('nicht gefunden') || error?.code === 'P0002') {
    return 'Organisation nicht gefunden.';
  }
  if (msg.includes('Letzter Platform Admin')) {
    return msg;
  }
  if (msg.includes('Ungültig') || msg.includes('fehlt') || error?.code === '22023') {
    return 'Organisation konnte nicht erstellt werden.';
  }
  return 'Aktion fehlgeschlagen.';
}

export function usePlatformOrganizations(enabled: boolean) {
  return useQuery({
    queryKey: ['platform-orgs'],
    enabled,
    queryFn: async (): Promise<PlatformOrgListRow[]> => {
      const { data, error } = await supabase.rpc('platform_list_organizations');
      if (error) throw new Error(rpcErrorMessage(error));
      return (data ?? []) as PlatformOrgListRow[];
    },
  });
}

export function usePlatformOrganization(orgId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['platform-org', orgId],
    enabled: enabled && Boolean(orgId),
    queryFn: async (): Promise<PlatformOrgDetail> => {
      const { data, error } = await supabase.rpc('platform_get_organization', {
        p_org_id: orgId!,
      });
      if (error) throw new Error(rpcErrorMessage(error));
      return data as unknown as PlatformOrgDetail;
    },
  });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      displayName: string;
      website?: string;
      supportUrl?: string;
      logoUrl?: string;
      adminIdentityId?: string;
    }) => {
      const { data, error } = await supabase.rpc('platform_create_organization', {
        p_name: input.name,
        p_display_name: input.displayName || undefined,
        p_website: input.website || undefined,
        p_support_url: input.supportUrl || undefined,
        p_logo_url: input.logoUrl || undefined,
        p_admin_identity_id: input.adminIdentityId || undefined,
      });
      if (error) throw new Error(rpcErrorMessage(error));
      return data as { id: string; name: string; status: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform-orgs'] });
    },
  });
}

export function useSetOrganizationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orgId: string; status: 'active' | 'inactive' }) => {
      const { data, error } = await supabase.rpc('platform_set_organization_status', {
        p_org_id: input.orgId,
        p_status: input.status,
      });
      if (error) throw new Error(rpcErrorMessage(error));
      return data;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['platform-orgs'] });
      void qc.invalidateQueries({ queryKey: ['platform-org', vars.orgId] });
    },
  });
}

export function useCreateOrgAdminInvite() {
  return useMutation({
    mutationFn: async (orgId: string) => {
      const { data, error } = await supabase.rpc('platform_create_org_admin_invite', {
        p_org_id: orgId,
        p_invite_role: 'admin',
      });
      if (error) throw new Error(rpcErrorMessage(error));
      const row = Array.isArray(data) ? data[0] : data;
      return row as { invite_code: string; invite_expires_at: string };
    },
  });
}

export function usePlatformAdmins(enabled: boolean) {
  return useQuery({
    queryKey: ['platform-admins'],
    enabled,
    queryFn: async (): Promise<PlatformAdminRow[]> => {
      const { data, error } = await supabase.rpc('platform_list_platform_admins');
      if (error) throw new Error(rpcErrorMessage(error));
      return (data ?? []) as PlatformAdminRow[];
    },
  });
}

export function useAddPlatformAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { identityId: string; notes?: string }) => {
      const { data, error } = await supabase.rpc('platform_add_platform_admin', {
        p_identity_id: input.identityId,
        p_notes: input.notes || undefined,
      });
      if (error) throw new Error(rpcErrorMessage(error));
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform-admins'] });
    },
  });
}

export function useRevokePlatformAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (identityId: string) => {
      const { data, error } = await supabase.rpc('platform_revoke_platform_admin', {
        p_identity_id: identityId,
      });
      if (error) throw new Error(rpcErrorMessage(error));
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['platform-admins'] });
    },
  });
}

export function usePlatformUsage(enabled: boolean) {
  return useQuery({
    queryKey: ['platform-usage'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('platform_usage_overview');
      if (error) throw new Error(rpcErrorMessage(error));
      return data as {
        total_events: number;
        coach_messages: number;
        app_opens: number;
        plans_committed: number;
        by_organization: Array<{ org_id: string; event_count: number }>;
      };
    },
  });
}

export function usePlatformConfig(enabled: boolean) {
  return useQuery({
    queryKey: ['platform-config'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('platform_config_status');
      if (error) throw new Error(rpcErrorMessage(error));
      return data as Record<string, string>;
    },
  });
}
