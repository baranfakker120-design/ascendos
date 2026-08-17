# PROJECT_STATE — AscendOS Multi-Tenant

**Last updated:** 2026-08-16  
**Updated by:** Phase 13 Glossily Readiness Foundation (repository; production unchanged)

---

## Current phase

**PHASE 13 — Glossily Readiness Foundation** — **IMPLEMENTED IN REPO** (awaiting human review; not merged/deployed by agent)

---

## Last completed phase (merged)

| Phase | PR   | Notes                                     |
| ----- | ---- | ----------------------------------------- |
| 2     | #112 | Platform admins + org role helpers        |
| 3     | #113 | Tenant `org_id` columns + Org #1 backfill |
| 4     | #114 | RLS tenant isolation CMS/Live/Stories     |
| 5     | #115 | Edge tenant discipline chat/ingest/push   |
| 6     | #116 | Knowledge + AI isolation                  |
| 7     | #117 | Live coaching + push + stories + media    |
| 8     | #118 | Frontend tenant awareness                 |
| 9     | #119 | Organization Admin `/admin`               |
| 10    | #120 | Platform Admin `/platform-admin`          |
| 11    | #121 | Billing + usage (€20/org + €2/seat)       |
| —     | #133 | Account deletion 14-day reactivation      |

Phase 12 second-org isolation tests remain in repo from prior work.

---

## Next step

**Human decision only:**

1. Review/merge Phase 13 PR
2. Apply migration `20260916000060_glossily_readiness_foundation.sql` when approved
3. **Do not** create production Org B / Glossily without explicit approval

---

## Current architecture stand (facts)

| Area                        | Status                                                   |
| --------------------------- | -------------------------------------------------------- |
| Single Supabase project     | Yes                                                      |
| Organizations + memberships | Yes — seeded Org #1 + Team Seyda                         |
| Org selector                | `x-ascendos-org` + `current_org_id()` + cache clear      |
| Roles                       | Org roles + `platform_admins`                            |
| Knowledge Fast Scan         | SHA-256 duplicate / version hints                        |
| AI usage ledger             | `ai_usage_events` (coach-chat wired)                     |
| Billing                     | Estimated €20+€2 model (cents); **no Stripe / payments** |
| Second production org       | **NOT CREATED**                                          |
| Radar                       | Org #1 only (unchanged)                                  |

---

## Hard constraints (do not violate)

1. One platform / one Supabase / central AI & VAPID / central Meta — **no per-org forks**
2. Multi-tenancy = data + RLS + server auth — **not** frontend hiding
3. Team Seyda becomes normal org; preserve data & behavior
4. Autopilot feed = **exactly 1 image**; Manual carousel separate (≤10)
5. No secret/key values in docs; no silent secret changes
6. No migration / deploy / merge / production mutation without explicit approval
7. Before future AscendOS work: read Constitution + this file + relevant ADRs
8. **Never auto-create a second production organization**

---

## Production status

| Item                            | State                                      |
| ------------------------------- | ------------------------------------------ |
| This Phase 13 work              | Repository only — production **UNCHANGED** |
| Database                        | **UNCHANGED** by agent                     |
| Secrets / API keys / VAPID      | **UNCHANGED**                              |
| Migrations applied by this work | **NONE**                                   |
| Deploy                          | **NONE**                                   |
| Glossily / Org B                | **NOT CREATED**                            |

---

## Documentation index

| File                                    | Role                       |
| --------------------------------------- | -------------------------- |
| `PHASE_13_GLOSSILY_READINESS.md`        | Phase 13 report            |
| `ADR/0011-knowledge-operating-model.md` | CMS vs RAG                 |
| `ADR/0012-org-special-features.md`      | Team Seyda / Radar classes |
| `PROJECT_STATE.md`                      | This file                  |
