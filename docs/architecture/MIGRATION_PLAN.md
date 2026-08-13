# Migration Plan — Multi-Tenant AscendOS

**Status:** Phase 0 complete (docs only)  
**Date:** 2026-08-13  
**Authority:** `ASCENDOS_CONSTITUTION.md`

---

## 0. Principles

- **No Big Bang**
- Preserve Team Seyda behavior and data
- No production / deploy / merge / secret / data changes without explicit approval
- Every schema phase needs backup + rollback thinking
- Update `PROJECT_STATE.md` after each completed phase

---

## Phase overview

| Phase | Name                                                | Implement?                    |
| ----- | --------------------------------------------------- | ----------------------------- |
| **0** | Bestandsaufnahme + Architektur-Memory               | **DONE (docs)**               |
| 1     | Architektur + Datenmodell vertiefen / ADRs finalize | Docs / design                 |
| 2     | Organizations + Rollen (target vocabulary)          | Code + migrations (later)     |
| 3     | Database + RLS for gap tables                       | Migrations                    |
| 4     | Backend + APIs / Edge org-header discipline         | Edge + RPCs                   |
| 5     | Knowledge + AI isolation (CMS + coach-chat)         | Code + migrations             |
| 6     | Frontend tenant awareness (remove Seyda hardcoding) | Frontend                      |
| 7     | Organization Admin UI                               | Frontend + auth               |
| 8     | Platform Admin UI                                   | Frontend + platform principal |
| 9     | Billing / Usage (design → implement)                | Deferred product              |
| 10    | Second real organization                            | Ops + verification            |

---

## Phase 0 — Bestandsaufnahme (this phase)

**Done when:** architecture docs + ADRs + PROJECT_STATE exist; production untouched.

Deliverables: this folder’s documents + Phase 0 report.

---

## Phase 1 — Architecture + data model

- Confirm table-by-table `org_id` retrofit list
- Decide platform principal storage (ADR)
- Decide Team Seyda migration shape (rename vs keep Chogan org + Team Seyda team)
- Freeze Autopilot/Manual carousel constraints in ADR (already product law)
- Still **no** production schema change unless separately approved

---

## Phase 2 — Organizations + roles

- Introduce target role model without breaking current memberships
- Map `berater` → MEMBER semantics; keep `super_admin` as org admin until rename
- Add platform principal **without** granting it to all org super_admins
- Tests for role resolution

---

## Phase 3 — Database + RLS

Priority gap tables:

1. `live_coaching_events` (+ media policies)
2. `coach_knowledge_*`
3. `ascend_stories`
4. `coaching_notification_outbox`
5. push fan-out filters / optional `org_id` on subscriptions strategy

Backfill: assign existing rows to Org A (Chogan / Team Seyda seed).

---

## Phase 4 — Backend + APIs

- Audit every Edge Function for `x-ascendos-org` forwarding
- Fix `coach-chat` / any mirror-only org resolution
- Service-role jobs: mandatory org/membership filters + logging

---

## Phase 5 — Knowledge + AI isolation

- Org-scope CMS
- Prompt assembly guarantees
- Isolation tests for RAG + CMS + coach

---

## Phase 6 — Frontend tenant awareness

- Replace `/team-seyda` hardcoding with org links / branding
- Org-driven Mehr links
- Remove Essence/Seyda assumptions from shared UI
- Keep UX parity for Team Seyda via data

---

## Phase 7 — Organization Admin

- `/admin` (or evolve `/more` admin section) bound to `currentOrganization`
- Capabilities per ROLE_MODEL

---

## Phase 8 — Platform Admin

- `/platform-admin` + server checks
- Org create/activate/deactivate
- No access for org admins

---

## Phase 9 — Billing / Usage

- Design meters (€20 + €2 model)
- Optional usage_events aggregation
- Still central API keys

---

## Phase 10 — Second real organization

- Provision Org B
- Run full isolation matrix
- Confirm Autopilot feed=1 and Manual carousel intact
- Confirm Live Coaching / Knowledge / Links isolated

---

## Rollback posture (every implementing phase)

- Prefer additive columns + backfill over destructive renames
- Keep dual-read windows where needed
- Snapshot / backup before production migration
- Feature flags for admin surfaces
- Never `db push --include-all` / never apply gap migrations blindly (existing AscendOS DB discipline)

---

## Explicit non-actions until approval

- No migrate / deploy / merge / secret change / API key change / production data mutation from Phase 0 docs work
