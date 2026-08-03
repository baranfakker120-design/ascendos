import { useQuery } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { Select } from '@shared/ui/Select';
import { useAuth } from './AuthProvider';

/**
 * Active organization selector — only when multiple memberships exist.
 * Sets x-ascendos-org via AuthProvider → supabase client.
 */
export function OrgSwitcher() {
  const { memberships, membership, setActiveOrganization, needsOrgSelection } = useAuth();
  const orgIds = memberships.map((m) => m.org_id);

  const { data: orgs } = useQuery({
    queryKey: ['auth-org-names', orgIds.join(',')],
    enabled: orgIds.length > 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .in('id', orgIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (memberships.length <= 1) return null;

  const labelFor = (orgId: string) => orgs?.find((o) => o.id === orgId)?.name ?? 'Organisation';

  return (
    <Select
      label="Aktive Organisation"
      aria-label="Aktive Organisation"
      value={membership?.org_id ?? ''}
      onChange={(e) => {
        if (e.target.value) setActiveOrganization(e.target.value);
      }}
      className={needsOrgSelection ? 'border-accent-deep' : ''}
    >
      {needsOrgSelection ? <option value="">Organisation wählen…</option> : null}
      {memberships.map((m) => (
        <option key={m.id} value={m.org_id}>
          {labelFor(m.org_id)}
        </option>
      ))}
    </Select>
  );
}
