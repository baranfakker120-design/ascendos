/**
 * Phase 9 — ORGANIZATION_ADMIN client gate (UX only; RLS/RPC are the boundary).
 * Maps memberships.role ∈ {super_admin, admin} for the active org.
 * Never equals PLATFORM_SUPER_ADMIN (platform_admins).
 */

export function isOrganizationAdminRole(role: string | null | undefined): boolean {
  return role === 'super_admin' || role === 'admin';
}
