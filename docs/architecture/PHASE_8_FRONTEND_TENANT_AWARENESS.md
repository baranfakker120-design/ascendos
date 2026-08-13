# PHASE 8 — Frontend Tenant Awareness

**Status:** Implemented in repository (awaiting human review)  
**Branch:** `cursor/phase-8-frontend-tenant-awareness-c4aa`  
**Production:** Unchanged — no deploy, no production migration apply

---

## Goal

AscendOS frontend must not assume the product is exclusively Team Seyda / Chogan / WayToMoon. Organization #1 remains real data; runtime hardcodes are removed. Active organization branding + `external_tools` drive visible links and labels.

---

## Removed / replaced hardcodings

| Surface      | Before                                         | After                                                 |
| ------------ | ---------------------------------------------- | ----------------------------------------------------- |
| Guide page   | Hardcoded `https://teamseydaguide.netlify.app` | `organizations.branding.guideUrl` or tool key `guide` |
| Route        | `/team-seyda` only                             | `/guide` + redirect from `/team-seyda`                |
| More page    | “Team Seyda Guide”                             | Org display name + guide when configured              |
| Share tools  | Pinned WayToMoon URL                           | URL from `external_tools` only                        |
| Coach drafts | Hardcoded WayToMoon URL in copy                | `{onboardingUrl}` from active org tools               |
| Coach labels | WayToMoon event text                           | “Onboarding …” (domain key `waytomoon_sent` kept)     |
| Nav icon     | `TeamSeydaIcon` / `teamseyda.svg`              | Generic `TeamIcon` (SVG unused asset removed)         |
| i18n         | `teamSeyda.*`                                  | `orgGuide.*` / `more.orgGuide*`                       |
| Org switcher | `organizations.name` only                      | Prefers `branding.display_name`                       |
| Coach chrome | Always platform / risk of Seyda                | `branding.coachDisplayName` else platform “Ascent”    |

---

## Data sources

- **Active org:** Auth membership / `x-ascendos-org` (server/RLS remain the security boundary)
- **Branding:** `organizations.branding` (`display_name`, `guideUrl`, `coachDisplayName`, colors, …)
- **Links:** `external_tools` (onboarding key may be `waytomoon` or `onboarding`)
- **Query keys:** `['external-tools', orgId]`, `['organization-profile', orgId]`

ADR 0007 preserved: `organizations.name` = `Chogan`; visible brand = `branding.display_name` = `Team Seyda` for Org #1.

---

## Org #1 parity (data, not code)

Migration `20260904000048_phase8_org1_branding_guide.sql` + seed/bootstrap updates:

- `display_name`: Team Seyda
- `guideUrl`: https://teamseydaguide.netlify.app
- Onboarding tool URL remains WayToMoon host in **data**; visible name → “Onboarding”

---

## Org B simulation (tests only)

Unit tests simulate Org A vs Org B branding/tools. Org B never inherits Team Seyda / WayToMoon URLs. No second production organization.

---

## Remaining intentional references

| Kind                 | Examples                                                                    |
| -------------------- | --------------------------------------------------------------------------- |
| KEEP — Org seed      | `seed.sql`, `bootstrap.sql`, journey copy mentioning WayToMoon historically |
| KEEP — domain keys   | `waytomoon`, `waytomoon_sent`, contact source enum                          |
| KEEP — documentation | Constitution, ADRs, PROJECT_BIBLE historical language                       |
| KEEP — test fixtures | `shareVerification.test.ts` URLs as expected share targets                  |
| KEEP — folder alias  | `src/features/team-seyda/` path + `TeamSeydaPage` export alias              |
| REPLACE done         | Runtime FE URLs, More/Guide/Coach/share hardcodes                           |

---

## Out of scope

- Phase 9 Admin / Phase 10 Platform Admin
- Phase 11 Billing
- Phase 12 Second production org
- Autopilot / Manual carousel / AI providers / API keys

---

## Tests added

- `src/shared/org/orgBranding.test.ts` — Org A/B resolution
- `src/shared/org/frontendHardcodeAudit.test.ts` — runtime FE URL audit
- `src/shared/offline/queryPersister.phase8.test.ts` — persist roots
- Updated coach draft + Phase 6 AI hardcode audit expectations
