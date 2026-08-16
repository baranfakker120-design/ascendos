# ADR 0012 — Organization special features (Team Seyda / Radar)

**Status:** Accepted  
**Date:** 2026-08-16  
**Deciders:** Glossily readiness / future architecture program

## Context

Some AscendOS surfaces still mention Team Seyda, Chogan, or Essence Tribe. Multi-tenant architecture requires classifying each occurrence so Org #1 product behavior is preserved without blocking future orgs (e.g. Glossily).

## Decision classes

| Class | Meaning |
| ----- | ------- |
| **A** | Make organization-neutral (config / branding / tools) |
| **B** | Legitimate org-specific feature (data of Org #1) |
| **C** | Historical legacy (folder names, redirects) — leave until cleanup wave |
| **D** | Product gate Org #1 only for now — must not become the multi-tenant pattern |

## Catalog (current)

| Location | Class | Notes |
| -------- | ----- | ----- |
| `team-seyda-radar/*`, Radar migration CHECK, radar cron | **D** | Stays Org #1 only; do not generify now; do not remove gates |
| Seed org name Chogan / branding Team Seyda | **B** | Org #1 data, not platform code |
| `organizations.branding` / `external_tools` | **A** | Already org config |
| CORE_RULES / FE URL audits | **A** | Already scrubbed; keep audits |
| Folder `features/team-seyda/`, route `/team-seyda` → `/guide` | **C** | Compatibility alias |
| Essence Tribe / Chogan labels inside Radar config | **D** | Only returned when `isTeamSeydaRadarOrg` |

## Consequences

- Glossily readiness does **not** require Radar multi-org.
- Future Radar for other orgs needs a new ADR + config table — not a copy of hardcoded targets.
- Hardcode audits continue; Radar paths remain explicit allowlisted exceptions.
