# PROJECT_STATE — AscendOS Multi-Tenant

**Last updated:** 2026-08-13  
**Updated by:** Phase 8 Frontend Tenant Awareness (repository; production unchanged)

---

## Current phase

**PHASE 8 — Frontend Tenant Awareness** — **IMPLEMENTED IN REPO** (awaiting human review; not merged/deployed by agent)

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

---

## Next step

**PHASE 9+** only after explicit Phase 8 approval — Admin UI, then Platform Admin, Billing, second org.

Do **not** apply Phase 8 migration to production without approval.

---

## Current architecture stand (facts)

| Area                        | Status                                                     |
| --------------------------- | ---------------------------------------------------------- |
| Single Supabase project     | Yes                                                        |
| Organizations + memberships | Yes — seeded Org #1 + Team Seyda                           |
| Org selector                | `x-ascendos-org` + `current_org_id()`                      |
| Roles                       | Org roles + `platform_admins`                              |
| RAG / AI context            | Org-scoped (Phase 6)                                       |
| Knowledge Center CMS        | Org-scoped RLS; not in coach-chat prompts                  |
| Live Coaching / Outbox      | Org-scoped RLS + push membership filter                    |
| Ascend Stories              | Org-scoped RLS                                             |
| coaching-media Storage      | **Private** + signed URLs (Phase 7)                        |
| Content / Autopilot / IG    | Org-scoped; Autopilot feed = 1 image; Manual carousel ≤ 10 |
| Web Push                    | Central VAPID; send-time org filter (ADR 0008)             |
| Frontend branding / tools   | **Org-scoped** (Phase 8) — no Team Seyda / WayToMoon FE pins |
| Platform Admin UI           | **Missing** (Phase 10)                                     |

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

## Known risks

1. Legacy public `media_url` values become inert after private bucket apply (expected)
2. Org #1 branding migration not yet applied in production (repo only)
3. Admin UIs missing (Phase 9–10)
4. Billing not implemented (Phase 11)
5. No second production organization (Phase 12)
6. `coach_messages_today` counts across orgs (daily limit; not AI context)

---

## Production status

| Item                            | State                                      |
| ------------------------------- | ------------------------------------------ |
| This Phase 8 work               | Repository only — production **UNCHANGED** |
| Database                        | **UNCHANGED** by agent                     |
| Secrets / API keys / VAPID      | **UNCHANGED**                              |
| Migrations applied by this work | **NONE** (migration exists in repo only)   |
| Deploy                          | **NONE**                                   |
| Merge                           | Requires human approval                    |

---

## Migration status (multi-tenant program)

| Phase | Status                                |
| ----- | ------------------------------------- |
| 0     | Done (docs)                           |
| 2–7   | Merged                                |
| 8     | Implemented in repo — awaiting review |
| 9–12  | Not started                           |

---

## Documentation index

| File                                             | Role                    |
| ------------------------------------------------ | ----------------------- |
| `PHASE_7_LIVE_COACHING_PUSH_STORIES.md`          | Phase 7 report          |
| `PHASE_8_FRONTEND_TENANT_AWARENESS.md`           | Phase 8 report          |
| `ADR/0008-user-level-push-org-filter-at-send.md` | Push subscription model |
| `ADR/0010-private-coaching-media-signed-urls.md` | Storage model           |
| `PROJECT_STATE.md`                               | This file               |
