/**
 * Team Seyda Radar — Org #1 scoped content-idea concept (additive, no DB migration).
 * Org #2 and other tenants never receive Chogan / Essence Tribe radar config.
 */

export const TEAM_SEYDA_ORG_ID = '00000000-0000-0000-0000-000000000001';

export type RadarSourceKind = 'chogan' | 'essence_tribe' | 'team_seyda' | 'business';

export type RadarContentIdeaFormat = 'story' | 'feed';

export interface TeamSeydaRadarSource {
  id: string;
  kind: RadarSourceKind;
  label: string;
  /** Informational only — not a scrape target in this phase. */
  note: string;
}

export interface TeamSeydaRadarIdea {
  id: string;
  title: string;
  summary: string;
  category: 'product' | 'promo' | 'company' | 'event' | 'campaign' | 'business';
  suggestedFormat: RadarContentIdeaFormat;
  sourceKind: RadarSourceKind;
}

export interface TeamSeydaRadarConfig {
  orgId: typeof TEAM_SEYDA_ORG_ID;
  enabled: true;
  sources: TeamSeydaRadarSource[];
  ideas: TeamSeydaRadarIdea[];
}

/** Hard gate — never return Team Seyda radar for other orgs. */
export function isTeamSeydaRadarOrg(orgId: string | null | undefined): boolean {
  return orgId === TEAM_SEYDA_ORG_ID;
}

/**
 * Visibility/query org for Radar.
 * Active membership wins. An explicit other-org membership hides Radar.
 * If membership is not resolved yet, Org-#1 profile mirror may show it.
 * Never use a Team Seyda profile to override a non-#1 membership.
 */
export function resolveRadarUiOrgId(
  membershipOrgId: string | null | undefined,
  profileOrgId: string | null | undefined
): string | null {
  if (isTeamSeydaRadarOrg(membershipOrgId)) return TEAM_SEYDA_ORG_ID;
  if (membershipOrgId) return null;
  if (isTeamSeydaRadarOrg(profileOrgId)) return TEAM_SEYDA_ORG_ID;
  return null;
}

/**
 * Returns radar config only for Org #1. Other orgs always get null (no leak).
 * No persistence / no network — conceptual service for FE/admin wiring.
 */
export function getTeamSeydaRadarConfig(
  orgId: string | null | undefined
): TeamSeydaRadarConfig | null {
  if (!isTeamSeydaRadarOrg(orgId)) return null;

  return {
    orgId: TEAM_SEYDA_ORG_ID,
    enabled: true,
    sources: [
      {
        id: 'chogan-products',
        kind: 'chogan',
        label: 'Chogan Produkte',
        note: 'Produktneuheiten und Katalog-Updates (manuell / zukünftige Feeds).',
      },
      {
        id: 'essence-tribe',
        kind: 'essence_tribe',
        label: 'Essence Tribe',
        note: 'Kampagnen und Community-Impulse — nur Team Seyda.',
      },
      {
        id: 'team-seyda-ops',
        kind: 'team_seyda',
        label: 'Team Seyda',
        note: 'Interne Aktionen, Events und Guide-Updates.',
      },
    ],
    ideas: [
      {
        id: 'idea-story-product',
        title: 'Neues Produkt als Story',
        summary: 'Vertikales 9:16 Story-Layout mit Produktname und kurzem Benefit.',
        category: 'product',
        suggestedFormat: 'story',
        sourceKind: 'chogan',
      },
      {
        id: 'idea-feed-promo',
        title: 'Aktion als Feed',
        summary: '1:1 oder 4:5 Feed-Post mit klarer CTA zur Aktion.',
        category: 'promo',
        suggestedFormat: 'feed',
        sourceKind: 'essence_tribe',
      },
    ],
  };
}

export function teamSeydaRadarQueryKey(orgId: string | null | undefined) {
  return ['team-seyda-radar', orgId ?? 'none'] as const;
}
