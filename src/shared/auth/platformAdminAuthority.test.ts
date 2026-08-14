import { describe, expect, it } from 'vitest';
import { isPlatformSuperAdminFlag } from './platformAdminAuthority';
import { isOrganizationAdminRole } from './organizationAdminAuthority';

describe('Phase 10 — platform admin authority', () => {
  it('requires explicit true from server RPC', () => {
    expect(isPlatformSuperAdminFlag(true)).toBe(true);
    expect(isPlatformSuperAdminFlag(false)).toBe(false);
    expect(isPlatformSuperAdminFlag(null)).toBe(false);
    expect(isPlatformSuperAdminFlag(undefined)).toBe(false);
  });

  it('org admin role is never platform admin', () => {
    expect(isOrganizationAdminRole('super_admin')).toBe(true);
    expect(isOrganizationAdminRole('admin')).toBe(true);
    expect(isPlatformSuperAdminFlag(false)).toBe(false);
  });
});
