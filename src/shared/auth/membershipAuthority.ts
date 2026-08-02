import type { Membership } from '@shared/types/domain';

export type AuthorityRole = Membership['role'];

const STORAGE_PREFIX = 'ascendos.activeOrg.';

export function isSuperAdminRole(role: string | null | undefined): boolean {
  return role === 'super_admin';
}

/** Resolve which org should be active given memberships + optional stored/preferred ids. */
export function resolveActiveOrgId(
  memberships: Pick<Membership, 'org_id'>[],
  options: {
    storedOrgId?: string | null;
    mirrorOrgId?: string | null;
  } = {}
): string | null {
  if (memberships.length === 0) return null;
  if (memberships.length === 1) return memberships[0].org_id;

  const { storedOrgId = null, mirrorOrgId = null } = options;
  if (storedOrgId && memberships.some((m) => m.org_id === storedOrgId)) {
    return storedOrgId;
  }
  if (mirrorOrgId && memberships.some((m) => m.org_id === mirrorOrgId)) {
    return mirrorOrgId;
  }
  return memberships[0]?.org_id ?? null;
}

export function pickActiveMembership<T extends Pick<Membership, 'org_id' | 'status'>>(
  memberships: T[],
  activeOrgId: string | null
): T | null {
  const active = memberships.filter((m) => m.status === 'active');
  if (active.length === 0) return null;
  if (!activeOrgId) return active.length === 1 ? active[0] : null;
  return active.find((m) => m.org_id === activeOrgId) ?? null;
}

export function activeOrgStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readStoredActiveOrg(userId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(activeOrgStorageKey(userId));
  } catch {
    return null;
  }
}

export function writeStoredActiveOrg(userId: string, orgId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const key = activeOrgStorageKey(userId);
    if (!orgId) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, orgId);
  } catch {
    // private mode
  }
}
