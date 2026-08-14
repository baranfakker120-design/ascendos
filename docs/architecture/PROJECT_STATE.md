# PROJECT_STATE — AscendOS Multi-Tenant

**Last updated:** 2026-08-14  
**Updated by:** Phase 11 Billing + Usage Architecture (repository; production unchanged)

---

## Current phase

**PHASE 11 — Billing + Usage Architecture** — **IMPLEMENTED IN REPO** (awaiting human review; not merged/deployed by agent)

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

---

## Next step

**PHASE 12+** only after explicit Phase 11 approval — second production organization / payment provider later.

Do **not** apply Phase 11 migration to production without approval.

---

## Current architecture stand (facts)

| Area                        | Status                                                   |
| --------------------------- | -------------------------------------------------------- |
| Single Supabase project     | Yes                                                      |
| Organizations + memberships | Yes — seeded Org #1 + Team Seyda                         |
| Org selector                | `x-ascendos-org` + `current_org_id()`                    |
| Roles                       | Org roles + `platform_admins`                            |
| Org Admin UI                | **`/admin`** including **Billing** (Phase 11)            |
| Platform Admin UI           | **`/platform-admin`** including **Billing** (Phase 11)   |
| Billing                     | Estimated €20+€2 model (cents); **no Stripe / payments** |
| Autopilot / Manual carousel | Unchanged (1 image / ≤10)                                |

---

## Hard constraints (do not violate)

1. One platform / one Supabase / central AI & VAPID / central Meta — **no per-org forks**
2. Multi-tenancy = data + RLS + server auth — **not** frontend hiding
3. Team Seyda becomes normal org; preserve data & behavior
4. Autopilot feed = **exactly 1 image**; Manual carousel separate (≤10)
5. No secret/key values in docs; no silent secret changes
6. No migration / deploy / merge / production mutation without explicit approval
7. Before future AscendOS work: read Constitution + this file + relevant ADRs

---

## Production status

| Item                            | State                                      |
| ------------------------------- | ------------------------------------------ |
| This Phase 11 work              | Repository only — production **UNCHANGED** |
| Database                        | **UNCHANGED** by agent                     |
| Secrets / API keys / VAPID      | **UNCHANGED**                              |
| Migrations applied by this work | **NONE** (migration exists in repo only)   |
| Deploy                          | **NONE**                                   |
| Stripe / payments               | **NOT IMPLEMENTED**                        |
| Second production org           | **NOT CREATED**                            |

---

## Migration status (multi-tenant program)

| Phase | Status                                |
| ----- | ------------------------------------- |
| 0     | Done (docs)                           |
| 2–10  | Merged                                |
| 11    | Implemented in repo — awaiting review |
| 12+   | Not started                           |

---

## Documentation index

| File                         | Role            |
| ---------------------------- | --------------- |
| `PHASE_10_PLATFORM_ADMIN.md` | Phase 10 report |
| `PHASE_11_BILLING_USAGE.md`  | Phase 11 report |
| `PROJECT_STATE.md`           | This file       |
