/**
 * Pure Phase-5 push recipient filter (unit-tested).
 * Must stay aligned with supabase/functions/_shared/coaching-push/recipients.ts
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

export function assertPayloadOrgSafe(
  payload: Record<string, unknown>,
  eventOrgId: string
): boolean {
  if (payload.org_id != null && String(payload.org_id) !== eventOrgId) return false;
  if (payload.orgId != null && String(payload.orgId) !== eventOrgId) return false;
  return true;
}
