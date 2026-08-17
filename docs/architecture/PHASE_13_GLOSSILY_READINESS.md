# PHASE 13 — Glossily Readiness Foundation

**Status:** Implemented in repository (PR pending human review)  
**Date:** 2026-08-16  
**Production:** UNCHANGED — no Org B, no deploy, no secret/Radar/Meta/Autopilot mutation

---

## Mission

Prepare AscendOS so a future organization (Glossily) can be onboarded **without rebuilding** the platform. Do **not** create Glossily in production.

---

## Audit summary (AREA | CURRENT | PROBLEM | FUTURE RISK | RECOMMENDATION | PRIORITY)

| AREA                   | CURRENT                    | PROBLEM                     | FUTURE RISK             | RECOMMENDATION               | PRIORITY |
| ---------------------- | -------------------------- | --------------------------- | ----------------------- | ---------------------------- | -------- |
| Tenant Architecture    | orgs/teams/memberships     | None structural             | Low                     | Keep ADR 0001                | P3       |
| Organization Isolation | RLS + header               | Stale query cache on switch | Cross-org UI flash      | Clear React Query on switch  | P0       |
| RLS                    | Strong                     | Doc drift                   | Mis-config              | Keep + tests                 | P3       |
| Branding               | branding jsonb             | Radar/seed hardcodes        | Pattern abuse           | Catalog A/B/C/D (ADR 0012)   | P0 docs  |
| Products               | No products table          | Unstructured in RAG         | Weak Glossily catalog   | Defer domain table           | P2       |
| Knowledge              | Dual CMS+RAG               | Operators confused          | Fake brain              | Sync status + ADR 0011       | P0       |
| Facts                  | Page JSON only             | No durable facts            | Bad pricing answers     | Defer fact table             | P2       |
| Documents              | PDF vision                 | No hash                     | Cost / re-analysis      | content_sha256 Fast Scan     | P0       |
| Versioning             | Manual CMS versions        | No file change detect       | Silent overwrite risk   | Fast Scan possible_version   | P0       |
| Temporal Knowledge     | valid_from/until           | Underused                   | History loss            | Defer; use existing columns  | P2       |
| AI Agents              | recruiting/sales/knowledge | No tool permissions         | Uncontrolled agents     | Defer multi-agent            | P2       |
| AI Permissions         | None                       | —                           | Autonomy risk           | Prepare only via ADR         | P2       |
| AI Cost                | usage_events counts        | No tokens                   | Blind spend             | ai_usage_events + coach-chat | P0       |
| Autopilot              | Org-scoped                 | OK                          | —                       | Unchanged                    | P3       |
| RADAR                  | Org #1 only                | Hardcoded                   | Wrong pattern if copied | Keep D; unchanged            | P3       |
| Meta                   | Central app                | Shared keys                 | Confused deputy         | Keep ADR 0001                | P3       |
| Billing                | organization_id            | Naming split                | Cosmetic                | Keep as-is                   | P3       |
| Account Deletion       | Identity-wide              | Multi-org wipe              | Dual-member surprise    | Document; defer              | P2       |
| Roles                  | Org + platform             | OK                          | —                       | Keep                         | P3       |
| Audit Logs             | usage_events               | Partial                     | Weak forensics          | ai_usage helps               | P1       |

---

## P0 implemented

1. Knowledge Fast Scan (SHA-256, exact duplicate skip, possible version / conflict flags)
2. Knowledge sync status helper (CMS vs RAG explicit)
3. `ai_usage_events` ledger + coach-chat recording
4. OrgSwitcher React Query cache clear
5. ADRs 0011 / 0012 + this phase report + PROJECT_STATE update

## Deferred

- Fact/entity graph, products domain, Organization Brain agents, Radar multi-org, Org-leave vs identity delete, Stripe

## Explicit non-goals this phase

- Create Glossily / Org B in production
- Change Radar targets, cron, secrets, Meta, Autopilot publishing

---

## Account deletion (documented debt)

`finalize_account_deletion` is **identity-level**: all memberships end. Acceptable for now; future multi-org leave ≠ identity delete requires a separate ADR.
