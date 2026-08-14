/**
 * Phase 12 — Second-org isolation readiness (pure helpers).
 * Complements pgTAP `phase12_second_org_isolation.test.sql`.
 * Does NOT create a production organization.
 */

import { knowledgeContainsForeignMarker, pickActiveMembershipFromList } from '../auth/tenantResolve';

export const ORG_A_SECRET_MARKER = 'ORG_A_SECRET_MARKER';
export const ORG_B_SECRET_MARKER = 'ORG_B_SECRET_MARKER';

export const ORG_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const ORG_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

/** Branding that Org B fixtures must use (no Team Seyda defaults). */
export const ISOLATION_TEST_ORG_BRANDING = {
  display_name: 'Isolation Test Org',
  coachDisplayName: 'Coach B',
  logoUrl: 'https://isolation-test.example/logo.png',
  primaryColor: '#00aa55',
  guideUrl: 'https://isolation-guide.test',
} as const;

export const FORBIDDEN_ORG_B_FALLBACKS = [
  'teamseydaguide',
  'waytomoon',
  'essence tribe',
  'chogan coach',
  'team seyda',
] as const;

export function orgBBrandingIsNeutral(
  branding: Record<string, unknown> | null | undefined
): boolean {
  const blob = JSON.stringify(branding ?? {}).toLowerCase();
  return FORBIDDEN_ORG_B_FALLBACKS.every((m) => !blob.includes(m));
}

export function secretMarkersIsolated(
  orgAContext: string,
  orgBContext: string
): { aClean: boolean; bClean: boolean } {
  return {
    aClean: !knowledgeContainsForeignMarker(orgAContext, ORG_B_SECRET_MARKER),
    bClean: !knowledgeContainsForeignMarker(orgBContext, ORG_A_SECRET_MARKER),
  };
}

export function resolveActiveOrgForUser(params: {
  memberships: Array<{ id: string; org_id: string; role: string; status: string }>;
  header: string | null;
}): string | null {
  const picked = pickActiveMembershipFromList(params.memberships, params.header);
  return picked?.org_id ?? null;
}

/** Storage object paths must be `{orgId}/...`. */
export function storagePathBelongsToOrg(path: string, orgId: string): boolean {
  return path === orgId || path.startsWith(`${orgId}/`);
}
