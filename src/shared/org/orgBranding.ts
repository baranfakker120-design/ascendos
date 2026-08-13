/**
 * Phase 8 — organization branding + links from DB (not FE hardcodes).
 */

export interface OrgBranding {
  display_name?: string;
  guideUrl?: string;
  primaryColor?: string;
  logoUrl?: string;
  website?: string;
  supportUrl?: string;
  coachDisplayName?: string;
  [key: string]: unknown;
}

export function parseOrgBranding(raw: unknown): OrgBranding {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as OrgBranding;
}

/** Prefer branding.display_name; fall back to organizations.name; never a foreign org brand. */
export function resolveOrgDisplayName(
  orgName: string | null | undefined,
  branding: OrgBranding
): string {
  const display = typeof branding.display_name === 'string' ? branding.display_name.trim() : '';
  if (display) return display;
  const name = (orgName ?? '').trim();
  return name || 'Organization';
}

export function resolveOrgGuideUrl(
  branding: OrgBranding,
  tools: Array<{ key: string; url: string; is_active?: boolean }>
): string | null {
  const fromBranding = typeof branding.guideUrl === 'string' ? branding.guideUrl.trim() : '';
  if (fromBranding) return fromBranding;
  const guideTool = tools.find((t) => t.key === 'guide' && t.url && t.is_active !== false);
  return guideTool?.url?.trim() || null;
}

export function resolveOnboardingToolUrl(
  tools: Array<{ key: string; url: string; is_active?: boolean }>
): string | null {
  // Legacy Org-1 key is `waytomoon`; newer orgs may use `onboarding`.
  const tool = tools.find(
    (t) => (t.key === 'waytomoon' || t.key === 'onboarding') && t.url && t.is_active !== false
  );
  return tool?.url?.trim() || null;
}

/** Prefer branding.coachDisplayName; never invent an Org-1 coach name. */
export function resolveCoachDisplayName(branding: OrgBranding): string | null {
  const name =
    typeof branding.coachDisplayName === 'string' ? branding.coachDisplayName.trim() : '';
  return name || null;
}

/** Never fall back to Org-1 brands when the active org has no config. */
export function assertNoForeignOrgFallback(
  activeOrgId: string,
  value: string | null | undefined,
  foreignMarkers: string[]
): boolean {
  if (!value) return true;
  if (!activeOrgId) return false;
  return !foreignMarkers.some((m) => value.toLowerCase().includes(m.toLowerCase()));
}
