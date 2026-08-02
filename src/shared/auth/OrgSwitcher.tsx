import { useQuery } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
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
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="sr-only">Aktive Organisation</span>
      <select
        aria-label="Aktive Organisation"
        value={membership?.org_id ?? ''}
        onChange={(e) => {
          if (e.target.value) setActiveOrganization(e.target.value);
        }}
        className={[
          'h-11 max-w-[12rem] truncate rounded-full border border-line bg-surface px-3 text-xs font-medium text-ink',
          'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          needsOrgSelection ? 'border-accent-deep' : '',
        ].join(' ')}
      >
        {needsOrgSelection ? <option value="">Organisation wählen…</option> : null}
        {memberships.map((m) => (
          <option key={m.id} value={m.org_id}>
            {labelFor(m.org_id)}
          </option>
        ))}
      </select>
    </label>
  );
}
