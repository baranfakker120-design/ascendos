import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import type { ExternalTool, Membership } from '@shared/types/domain';
import type { Json } from '@shared/types/database.types';
import type { OrgBranding } from '@shared/org/orgBranding';

export interface OrgAdminMemberRow {
  membership: Membership;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
}

export function useOrgAdminMembers() {
  const { membership } = useAuth();
  const orgId = membership?.org_id ?? null;
  return useQuery({
    queryKey: ['org-admin-members', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<OrgAdminMemberRow[]> => {
      const { data: rows, error } = await supabase
        .from('memberships')
        .select('*')
        .eq('org_id', orgId!)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      const list = (rows ?? []) as Membership[];
      const ids = [...new Set(list.map((m) => m.identity_id))];
      if (ids.length === 0) return [];
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, username')
        .in('id', ids);
      if (pErr) throw pErr;
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return list.map((m) => {
        const p = byId.get(m.identity_id);
        return {
          membership: m,
          first_name: p?.first_name ?? null,
          last_name: p?.last_name ?? null,
          username: p?.username ?? null,
        };
      });
    },
  });
}

export function useOrgAdminTools() {
  const { membership } = useAuth();
  const orgId = membership?.org_id ?? null;
  return useQuery({
    queryKey: ['org-admin-tools', orgId],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<ExternalTool[]> => {
      const { data, error } = await supabase.from('external_tools').select('*').order('sort_order');
      if (error) throw error;
      return (data ?? []) as ExternalTool[];
    },
  });
}

export function useOrgAdminAgents() {
  const { membership } = useAuth();
  const orgId = membership?.org_id ?? null;
  return useQuery({
    queryKey: ['org-admin-agents', orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase.from('agents').select('*').order('key');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOrgAdminInvites() {
  const { membership } = useAuth();
  const orgId = membership?.org_id ?? null;
  return useQuery({
    queryKey: ['org-admin-invites', orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invites')
        .select('code, role, expires_at, used_at, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateOrgBranding() {
  const qc = useQueryClient();
  const { membership } = useAuth();
  return useMutation({
    mutationFn: async (patch: OrgBranding) => {
      const { data, error } = await supabase.rpc('org_admin_update_branding', {
        p_branding: patch as unknown as Json,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['organization-profile', membership?.org_id] });
    },
  });
}

export function useUpsertOrgTool() {
  const qc = useQueryClient();
  const { membership } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      key: string;
      name: string;
      url: string;
      description?: string;
      sort_order?: number;
      is_active?: boolean;
    }) => {
      const { data, error } = await supabase.rpc('org_admin_upsert_external_tool', {
        p_key: input.key,
        p_name: input.name,
        p_url: input.url,
        p_description: input.description,
        p_sort_order: input.sort_order ?? 100,
        p_is_active: input.is_active ?? true,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['org-admin-tools', membership?.org_id] });
      void qc.invalidateQueries({ queryKey: ['external-tools', membership?.org_id] });
    },
  });
}

export function useSetMembershipRole() {
  const qc = useQueryClient();
  const { membership } = useAuth();
  return useMutation({
    mutationFn: async (input: { membershipId: string; role: string }) => {
      const { data, error } = await supabase.rpc('org_admin_set_membership_role', {
        p_membership_id: input.membershipId,
        p_role: input.role,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['org-admin-members', membership?.org_id] });
    },
  });
}

export function useSetMembershipStatus() {
  const qc = useQueryClient();
  const { membership } = useAuth();
  return useMutation({
    mutationFn: async (input: { membershipId: string; status: string }) => {
      const { data, error } = await supabase.rpc('org_admin_set_membership_status', {
        p_membership_id: input.membershipId,
        p_status: input.status,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['org-admin-members', membership?.org_id] });
    },
  });
}

export function useUpdateOrgAgent() {
  const qc = useQueryClient();
  const { membership } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      key: string;
      name?: string;
      system_prompt?: string;
      is_active?: boolean;
    }) => {
      const { data, error } = await supabase.rpc('org_admin_update_agent', {
        p_agent_key: input.key,
        p_name: input.name,
        p_system_prompt: input.system_prompt,
        p_is_active: input.is_active,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['org-admin-agents', membership?.org_id] });
    },
  });
}

export function useCreateOrgInvite() {
  const qc = useQueryClient();
  const { membership } = useAuth();
  return useMutation({
    mutationFn: async (inviteRole: string = 'berater') => {
      const { data, error } = await supabase.rpc('create_invite', {
        invite_role: inviteRole,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['org-admin-invites', membership?.org_id] });
    },
  });
}
