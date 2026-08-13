/**
 * Pure Phase-5 tenant resolve helpers (unit-tested).
 * Must stay aligned with supabase/functions/_shared/tenant.ts.
 */

export interface ActiveMembershipLike {
  id: string;
  org_id: string;
  role: string;
  status: string;
}

export function pickActiveMembershipFromList<T extends ActiveMembershipLike>(
  memberships: T[],
  orgHeader: string | null
): T | null {
  const active = memberships.filter((m) => m.status === 'active');
  if (active.length === 0) return null;
  if (orgHeader) {
    return active.find((m) => m.org_id === orgHeader) ?? null;
  }
  if (active.length === 1) return active[0];
  return null;
}

export function assertClientOrgMatches(
  bodyOrgId: unknown,
  serverOrgId: string
): { ok: true } | { ok: false; error: 'org_mismatch' } {
  if (bodyOrgId === undefined || bodyOrgId === null || bodyOrgId === '') {
    return { ok: true };
  }
  if (String(bodyOrgId) !== serverOrgId) {
    return { ok: false, error: 'org_mismatch' };
  }
  return { ok: true };
}

/** Coach RAG must never request another org's chunks. */
export function buildMatchKnowledgeOrgArgs(serverOrgId: string): { p_org_id: string } {
  return { p_org_id: serverOrgId };
}

/** Filter AI/RAG chunk markers for isolation assertions. */
export function knowledgeContainsForeignMarker(
  knowledgeText: string,
  foreignMarker: string
): boolean {
  return knowledgeText.includes(foreignMarker);
}

/** Conversation load must require active org (Phase 6 defense-in-depth). */
export function conversationBelongsToActiveOrg(
  convoOrgId: string | null | undefined,
  activeOrgId: string
): boolean {
  return Boolean(convoOrgId && convoOrgId === activeOrgId);
}
