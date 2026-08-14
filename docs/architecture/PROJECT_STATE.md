# PROJECT_STATE — AscendOS Multi-Tenant

**Last updated:** 2026-08-14  
**Updated by:** Phase 12 Second Organization + Full Tenant Isolation (repository; production unchanged)

---

## Current phase

**PHASE 12 — Second Organization + Full Tenant Isolation** — **IMPLEMENTED IN REPO** (awaiting human review; not merged/deployed by agent)

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

---

## Next step

**Human decision only:** whether to create a **second production organization**.

Do **not** create production Org B without explicit approval.

Do **not** apply unpaid migrations to production without approval.

---

## Current architecture stand (facts)

| Area                        | Status                                                   |
| --------------------------- | -------------------------------------------------------- |
| Single Supabase project     | Yes                                                      |
| Organizations + memberships | Yes — seeded Org #1 + Team Seyda                         |
| Org selector                | `x-ascendos-org` + `current_org_id()`                    |
| Roles                       | Org roles + `platform_admins`                            |
| Org Admin UI                | **`/admin`** including Billing                           |
| Platform Admin UI           | **`/platform-admin`** including Billing                  |
| Billing                     | Estimated €20+€2 model (cents); **no Stripe / payments** |
| Second org isolation tests  | **Phase 12 pgTAP + unit** (CI fixtures only)             |
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
8. **Never auto-create a second production organization**

---

## Production status

| Item                            | State                                      |
| ------------------------------- | ------------------------------------------ |
| This Phase 12 work              | Repository only — production **UNCHANGED** |
| Database                        | **UNCHANGED** by agent                     |
| Secrets / API keys / VAPID      | **UNCHANGED**                              |
| Migrations applied by this work | **NONE**                                   |
| Deploy                          | **NONE**                                   |
| Stripe / payments               | **NOT IMPLEMENTED**                        |
| Second production org           | **NOT CREATED**                            |

---

## Migration status (multi-tenant program)

| Phase | Status                                                     |
| ----- | ---------------------------------------------------------- |
| 0     | Done (docs)                                                |
| 2–11  | Merged                                                     |
| 12    | Implemented in repo — **MIGRATION: NONE**; awaiting review |
| 13+   | Not started                                                |

---

## Documentation index

| File                               | Role            |
| ---------------------------------- | --------------- |
| `PHASE_11_BILLING_USAGE.md`        | Phase 11 report |
| `PHASE_12_SECOND_ORG_ISOLATION.md` | Phase 12 report |
| `PROJECT_STATE.md`                 | This file       |
