import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useI18n } from '@shared/i18n';
import { Select } from '@shared/ui/Select';
import { useAuth } from './AuthProvider';

/**
 * Active organization selector — only when multiple memberships exist.
 * Sets x-ascendos-org via AuthProvider → supabase client.
 * Clears React Query cache on switch so Org A data never paints for Org B.
 */
export function OrgSwitcher() {
  const { t } = useI18n();
  const { memberships, membership, setActiveOrganization, needsOrgSelection } = useAuth();
  const queryClient = useQueryClient();
  const orgIds = memberships.map((m) => m.org_id);

  const { data: orgs } = useQuery({
    queryKey: ['auth-org-names', orgIds.join(',')],
    enabled: orgIds.length > 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, branding')
        .in('id', orgIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (memberships.length <= 1) return null;

  const labelFor = (orgId: string) => {
    const org = orgs?.find((o) => o.id === orgId);
    if (!org) return t('org.fallback');
    const branding =
      org.branding && typeof org.branding === 'object' && !Array.isArray(org.branding)
        ? (org.branding as Record<string, unknown>)
        : {};
    const display = typeof branding.display_name === 'string' ? branding.display_name.trim() : '';
    return display || org.name || t('org.fallback');
  };

  return (
    <Select
      label={t('org.active')}
      aria-label={t('org.active')}
      value={membership?.org_id ?? ''}
      onChange={(e) => {
        if (!e.target.value) return;
        setActiveOrganization(e.target.value);
        // Drop all cached tenant queries; orgId is part of many keys but not all.
        void queryClient.clear();
      }}
      className={needsOrgSelection ? 'border-accent-deep' : ''}
    >
      {needsOrgSelection ? <option value="">{t('org.choose')}</option> : null}
      {memberships.map((m) => (
        <option key={m.id} value={m.org_id}>
          {labelFor(m.org_id)}
        </option>
      ))}
    </Select>
  );
}
