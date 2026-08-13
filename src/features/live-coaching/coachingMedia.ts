/**
 * Phase 7 — coaching-media path + signed URL helpers (pure / unit-tested).
 * Upload path convention: {org_id}/{actorId|anon}/{timestamp-rand.ext}
 */

export const COACHING_MEDIA_BUCKET = 'coaching-media';

export function buildCoachingMediaObjectPath(
  orgId: string,
  actorId: string | null,
  fileName: string,
  nowMs = Date.now(),
  rand = Math.random().toString(36).slice(2)
): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || 'bin';
  const safeOrg = orgId.trim();
  if (!safeOrg) throw new Error('org_required');
  return `${safeOrg}/${actorId ?? 'anon'}/${nowMs}-${rand}.${ext}`;
}

/** First path segment must equal the server-resolved org. */
export function coachingMediaPathBelongsToOrg(objectPath: string, orgId: string): boolean {
  const folder = objectPath.split('/')[0] ?? '';
  return folder === orgId;
}

/**
 * Resolve which org owns an outbox send. Event org is authority.
 * Mismatch between outbox.org_id and event.org_id → reject.
 */
export function resolveDispatchOrgId(
  outboxOrgId: string | null | undefined,
  eventOrgId: string | null | undefined
): { ok: true; orgId: string } | { ok: false; reason: 'missing_org' | 'org_mismatch' } {
  if (!eventOrgId) {
    if (!outboxOrgId) return { ok: false, reason: 'missing_org' };
    return { ok: true, orgId: outboxOrgId };
  }
  if (outboxOrgId && outboxOrgId !== eventOrgId) {
    return { ok: false, reason: 'org_mismatch' };
  }
  return { ok: true, orgId: eventOrgId };
}
