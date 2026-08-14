/**
 * Phase 10 — PLATFORM_SUPER_ADMIN client gate (UX only).
 * Authoritative check is always `is_platform_super_admin()` / platform_admins.
 * Never derive from memberships.role or profiles.role.
 */

export function isPlatformSuperAdminFlag(value: boolean | null | undefined): boolean {
  return value === true;
}
