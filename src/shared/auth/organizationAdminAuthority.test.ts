import { describe, expect, it } from 'vitest';
import { isOrganizationAdminRole } from './organizationAdminAuthority';

describe('Phase 9 — organization admin authority', () => {
  it('allows org super_admin and admin', () => {
    expect(isOrganizationAdminRole('super_admin')).toBe(true);
    expect(isOrganizationAdminRole('admin')).toBe(true);
  });

  it('denies members and content roles', () => {
    expect(isOrganizationAdminRole('berater')).toBe(false);
    expect(isOrganizationAdminRole('leader')).toBe(false);
    expect(isOrganizationAdminRole('developer')).toBe(false);
    expect(isOrganizationAdminRole(null)).toBe(false);
  });

  it('does not treat platform vocabulary as org admin', () => {
    expect(isOrganizationAdminRole('PLATFORM_SUPER_ADMIN')).toBe(false);
    expect(isOrganizationAdminRole('platform_admin')).toBe(false);
  });
});
