/**
 * Team Seyda / Org #1 special-feature classification (ADR 0012).
 * Pure catalog for audits — does not enable Radar for other orgs.
 */

export type OrgSpecialClass = 'A' | 'B' | 'C' | 'D';

export type OrgSpecialEntry = {
  id: string;
  class: OrgSpecialClass;
  pathHint: string;
  note: string;
};

/** Documented special cases — keep Radar as D (Org #1 only). */
export const ORG_SPECIAL_FEATURES: OrgSpecialEntry[] = [
  {
    id: 'radar-product-gate',
    class: 'D',
    pathHint: 'src/features/team-seyda-radar/',
    note: 'Org #1 only; do not generify without new ADR',
  },
  {
    id: 'radar-db-check',
    class: 'D',
    pathHint: 'supabase/migrations/*team_radar*',
    note: 'CHECK org_id = Org #1',
  },
  {
    id: 'org1-seed-branding',
    class: 'B',
    pathHint: 'supabase/seed.sql',
    note: 'Chogan name + Team Seyda display_name are Org #1 data',
  },
  {
    id: 'guide-folder-alias',
    class: 'C',
    pathHint: 'src/features/team-seyda/',
    note: 'Legacy folder; page is OrganizationGuidePage',
  },
  {
    id: 'org-branding-json',
    class: 'A',
    pathHint: 'organizations.branding',
    note: 'Organization-neutral configuration surface',
  },
];

export function listOrgSpecialByClass(cls: OrgSpecialClass): OrgSpecialEntry[] {
  return ORG_SPECIAL_FEATURES.filter((e) => e.class === cls);
}
