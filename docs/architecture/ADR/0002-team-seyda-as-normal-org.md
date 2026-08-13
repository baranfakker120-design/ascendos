# ADR 0002 — Team Seyda is a normal organization

**Status:** Accepted  
**Date:** 2026-08-13  
**Deciders:** Product owner + architecture program (Phase 0)

## Context

Today’s product is seeded and branded as Chogan / Team Seyda, with hardcoded routes, iframe guide, prompts, and Mehr links. Multi-tenant AscendOS cannot encode Team Seyda as special-case logic.

## Decision

1. Team Seyda (current production tenant) becomes a **normal organization** (preserving existing rows / seed IDs during migration).
2. Org-specific coach, links, branding, and knowledge come from **organization data**, not from `if seyda` branches.
3. Behavior for Team Seyda users must remain equivalent after migration.

## Consequences

- Phase 6 removes hardcoding in favor of org config
- Essence Tribe remains a brand concept, not a required DB entity (org + team model)
- Seed UUIDs for Chogan / Team Seyda stay the migration anchor for Org A
