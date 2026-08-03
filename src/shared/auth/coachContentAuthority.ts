/**
 * Sprint 5.1 — who may edit Coach Knowledge Center & Live Coaching.
 * Additive: does not change isSuperAdminRole semantics.
 */

export function canManageCoachContent(role: string | null | undefined): boolean {
  return role === 'super_admin' || role === 'developer';
}
