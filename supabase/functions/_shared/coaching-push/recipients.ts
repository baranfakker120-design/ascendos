/**
 * Org-scoped push recipient selection (Phase 5).
 * push_subscriptions stay user-scoped; isolation happens at send time.
 *
 * Keep in sync with src/features/live-coaching/pushOrgRecipients.ts
 */

export interface MembershipRecipient {
  identity_id: string;
  org_id: string;
  status: string;
}

export interface PushSubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Keep only subscriptions whose user has an active membership in eventOrgId.
 */
export function filterSubscriptionsForOrg(
  subscriptions: PushSubRow[],
  memberships: MembershipRecipient[],
  eventOrgId: string
): PushSubRow[] {
  const allowedUsers = new Set(
    memberships
      .filter((m) => m.status === 'active' && m.org_id === eventOrgId)
      .map((m) => m.identity_id)
  );
  return subscriptions.filter((s) => allowedUsers.has(s.user_id));
}

/** Payload must not advertise a foreign organization id. */
export function assertPayloadOrgSafe(
  payload: Record<string, unknown>,
  eventOrgId: string
): boolean {
  if (payload.org_id != null && String(payload.org_id) !== eventOrgId) return false;
  if (payload.orgId != null && String(payload.orgId) !== eventOrgId) return false;
  return true;
}

/**
 * Event org is authority. Outbox org must match when both present
 * (Phase 7 — no cross-org outbox → event send).
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
