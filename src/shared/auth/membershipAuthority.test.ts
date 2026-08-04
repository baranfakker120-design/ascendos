import { describe, expect, it } from 'vitest';
import { isSuperAdminRole, pickActiveMembership, resolveActiveOrgId } from './membershipAuthority';

describe('membershipAuthority', () => {
  it('treats only super_admin as super admin', () => {
    expect(isSuperAdminRole('super_admin')).toBe(true);
    expect(isSuperAdminRole('admin')).toBe(false);
    expect(isSuperAdminRole('berater')).toBe(false);
    expect(isSuperAdminRole(null)).toBe(false);
  });

  it('auto-selects the only membership org', () => {
    expect(resolveActiveOrgId([{ org_id: 'org-a' }])).toBe('org-a');
  });

  it('prefers stored org, then mirror, then first when multiple', () => {
    const many = [{ org_id: 'org-a' }, { org_id: 'org-b' }];
    expect(resolveActiveOrgId(many, { storedOrgId: 'org-b' })).toBe('org-b');
    expect(resolveActiveOrgId(many, { mirrorOrgId: 'org-a' })).toBe('org-a');
    expect(resolveActiveOrgId(many)).toBe('org-a');
    expect(resolveActiveOrgId(many, { storedOrgId: 'org-x', mirrorOrgId: 'org-b' })).toBe('org-b');
  });

  it('picks the active membership for the selected org', () => {
    const rows = [
      { org_id: 'org-a', status: 'active' as const },
      { org_id: 'org-b', status: 'active' as const },
    ];
    expect(pickActiveMembership(rows, 'org-b')?.org_id).toBe('org-b');
    expect(pickActiveMembership(rows, null)).toBeNull();
    expect(pickActiveMembership([rows[0]], null)?.org_id).toBe('org-a');
  });
});
