import { useQuery } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';

export interface OrgBillingSnapshot {
  organization_id: string;
  plan_key: string;
  billing_status: string;
  subscription_status: string;
  currency: string;
  billing_email: string | null;
  base_price_cents: number;
  seat_price_cents: number;
  active_seats: number;
  seat_total_cents: number;
  estimated_monthly_cents: number;
  period_start: string;
  period_end: string;
  payment_note: string;
}

export interface OrgUsageSnapshot {
  organization_id: string;
  total_events: number;
  coach_messages: number;
  app_opens: number;
  plans_committed: number;
}

export interface PlatformBillingRow {
  organization_id: string;
  organization_name: string;
  display_name: string;
  billing_status: string;
  subscription_status: string;
  plan_key: string;
  active_seats: number;
  base_price_cents: number;
  seat_price_cents: number;
  seat_total_cents: number;
  estimated_monthly_cents: number;
  currency: string;
}

function rpcErrorMessage(error: { message?: string; code?: string } | null): string {
  const msg = error?.message ?? '';
  if (msg.includes('Keine Plattformberechtigung') || error?.code === '42501') {
    return 'Keine Berechtigung.';
  }
  return 'Aktion fehlgeschlagen.';
}

export function useOrgAdminBilling(enabled: boolean) {
  return useQuery({
    queryKey: ['org-admin-billing'],
    enabled,
    queryFn: async (): Promise<OrgBillingSnapshot> => {
      const { data, error } = await supabase.rpc('org_admin_get_billing');
      if (error) throw new Error(rpcErrorMessage(error));
      return data as unknown as OrgBillingSnapshot;
    },
  });
}

export function useOrgAdminUsage(enabled: boolean) {
  return useQuery({
    queryKey: ['org-admin-usage'],
    enabled,
    queryFn: async (): Promise<OrgUsageSnapshot> => {
      const { data, error } = await supabase.rpc('org_admin_get_usage');
      if (error) throw new Error(rpcErrorMessage(error));
      return data as unknown as OrgUsageSnapshot;
    },
  });
}

export function usePlatformBilling(enabled: boolean, status: string | null) {
  return useQuery({
    queryKey: ['platform-billing', status],
    enabled,
    queryFn: async (): Promise<PlatformBillingRow[]> => {
      const { data, error } = await supabase.rpc('platform_list_billing', {
        p_status: status || undefined,
      });
      if (error) throw new Error(rpcErrorMessage(error));
      return (data ?? []) as PlatformBillingRow[];
    },
  });
}
