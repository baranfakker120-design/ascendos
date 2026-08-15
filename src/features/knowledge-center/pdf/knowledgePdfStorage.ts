/**
 * Private Knowledge PDF storage path helpers (pure).
 * Authority: server current_org_id() — never trust client-only org ids for ACL.
 */

export const KNOWLEDGE_PDF_BUCKET = 'knowledge-pdfs';

export function buildKnowledgePdfObjectPath(
  orgId: string,
  actorId: string | null,
  fileName: string,
  nowMs = Date.now(),
  rand = Math.random().toString(36).slice(2)
): string {
  const safeOrg = orgId.trim();
  if (!safeOrg) throw new Error('org_required');
  const base = fileName.split('/').pop()?.trim() || 'document.pdf';
  const safeName = base.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 120);
  return `${safeOrg}/knowledge/${actorId ?? 'anon'}/${nowMs}-${rand}-${safeName}`;
}

export function knowledgePdfPathBelongsToOrg(objectPath: string, orgId: string): boolean {
  const parts = objectPath.split('/');
  return parts[0] === orgId && parts[1] === 'knowledge';
}

/** Deny forged organization_id that does not match active org. */
export function assertKnowledgePdfOrgMatch(
  providedOrgId: string | null | undefined,
  activeOrgId: string
): { ok: true } | { ok: false; error: 'org_mismatch' } {
  if (providedOrgId === undefined || providedOrgId === null || providedOrgId === '') {
    return { ok: true };
  }
  if (String(providedOrgId) !== activeOrgId) {
    return { ok: false, error: 'org_mismatch' };
  }
  return { ok: true };
}

export function assertKnowledgePdfHeaderMatch(
  headerOrg: string | null | undefined,
  activeOrgId: string
): { ok: true } | { ok: false; error: 'org_header_mismatch' } {
  if (!headerOrg) return { ok: true };
  if (headerOrg !== activeOrgId) return { ok: false, error: 'org_header_mismatch' };
  return { ok: true };
}
