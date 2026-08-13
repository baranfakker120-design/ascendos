/**
 * Phase 5 — Edge tenant discipline helpers.
 *
 * Canonical authority: memberships + x-ascendos-org (same rules as
 * active_membership_id() / content-assistant / instagram-oauth).
 * Never treat profiles.org_id as authorization.
 *
 * Keep pure resolve logic in sync with:
 *   src/shared/auth/tenantResolve.ts
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export interface ActiveMembership {
  id: string;
  org_id: string;
  role: string;
  status: string;
}

/** Forward Authorization + x-ascendos-org so PostgREST RLS sees current_org_id(). */
export function userClientFromRequest(req: Request): SupabaseClient {
  const forwardHeaders: Record<string, string> = {
    Authorization: req.headers.get('Authorization') ?? '',
  };
  const orgSelector = req.headers.get('x-ascendos-org');
  if (orgSelector) forwardHeaders['x-ascendos-org'] = orgSelector;
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: forwardHeaders },
  });
}

/**
 * Pure membership pick (header preferred; single active auto-resolves;
 * multi without header → null). Mirrors DB Fall 1–4 without profiles mirror.
 */
export function pickActiveMembershipFromList(
  memberships: ActiveMembership[],
  orgHeader: string | null
): ActiveMembership | null {
  const active = memberships.filter((m) => m.status === 'active');
  if (active.length === 0) return null;
  if (orgHeader) {
    return active.find((m) => m.org_id === orgHeader) ?? null;
  }
  if (active.length === 1) return active[0];
  return null;
}

export type ResolveMembershipResult =
  | { ok: true; userId: string; membership: ActiveMembership }
  | { ok: false; status: 401 | 403; error: 'not_authenticated' | 'no_active_membership' };

export async function resolveActiveMembership(
  db: SupabaseClient,
  req: Request
): Promise<ResolveMembershipResult> {
  const { data: userData, error: authError } = await db.auth.getUser();
  if (authError || !userData.user) {
    return { ok: false, status: 401, error: 'not_authenticated' };
  }

  const { data: memberships, error: membershipError } = await db
    .from('memberships')
    .select('id, org_id, role, status')
    .eq('identity_id', userData.user.id)
    .eq('status', 'active');
  if (membershipError) throw membershipError;

  const orgHeader = req.headers.get('x-ascendos-org');
  const list = (memberships as ActiveMembership[] | null) ?? [];
  const membership = pickActiveMembershipFromList(list, orgHeader);
  if (!membership) {
    return { ok: false, status: 403, error: 'no_active_membership' };
  }
  return { ok: true, userId: userData.user.id, membership };
}

/** Deny client-supplied org ids that do not match the server-resolved org. */
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
