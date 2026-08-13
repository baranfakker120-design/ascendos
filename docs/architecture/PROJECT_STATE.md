# PROJECT_STATE — AscendOS Multi-Tenant

**Last updated:** 2026-08-13  
**Updated by:** Phase 6 Knowledge + AI Isolation (repository; production unchanged)

---

## Current phase

**PHASE 6 — Knowledge + AI Isolation** — **IMPLEMENTED IN REPO** (awaiting human review; not merged/deployed by agent)

---

## Last completed phase (merged)

| Phase | PR  | Notes                                      |
| ----- | --- | ------------------------------------------ |
| 2     | #112 | Platform admins + org role helpers         |
| 3     | #113 | Tenant `org_id` columns + Org #1 backfill  |
| 4     | #114 | RLS tenant isolation CMS/Live/Stories      |
| 5     | #115 | Edge tenant discipline chat/ingest/push    |

---

## Next step

**PHASE 7+** only after explicit Phase 6 approval — Live Coaching + Push + Stories, then frontend tenant awareness / admin UIs.

Do **not** apply Phase 6 to production without approval.

---

## Current architecture stand (facts)

| Area                        | Status                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------- |
| Single Supabase project     | Yes — `shaydtihwicnocjjlnjm`                                                           |
| Organizations + memberships | Yes — seeded **1** org (Chogan) + Team Seyda                                           |
| Org selector                | `x-ascendos-org` + `current_org_id()`                                                  |
| Roles                       | Org roles + `platform_admins` / `is_platform_super_admin()`                            |
| RAG knowledge isolation     | Org-scoped; Phase 6 hardens `match_knowledge` + convo history                          |
| Knowledge Center CMS        | Org-scoped RLS (Phase 3/4); **not** in coach-chat AI prompts                           |
| Live Coaching / Stories     | Org-scoped RLS (Phase 4); push fan-out org-filtered (Phase 5)                          |
| Content / Autopilot / IG    | Org-scoped; Autopilot feed = 1 image; Manual carousel ≤ 10                             |
| Web Push                    | Central VAPID; dispatch membership-filtered                                            |
| Platform Admin UI           | **Missing** (Phase 10)                                                                 |
| Team Seyda hardcoding       | AI CORE_RULES neutralized (Phase 6); FE/routes still Phase 8                           |

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

1. Public `coaching-media` storage still public-read (Storage phase)
2. Frontend org switcher / brand hardcoding (Phase 8+)
3. Admin UIs missing (Phase 9–10)
4. Billing not implemented (Phase 11)
5. No second production organization (Phase 12)
6. `coach_messages_today` counts across orgs (daily limit; not AI context)
7. OpenRouter / Gemini credits are platform cost centers

---

## Production status

| Item                            | State                                           |
| ------------------------------- | ----------------------------------------------- |
| Production app                  | Live (Cloudflare Pages)                         |
| This Phase 6 work               | Repository only — production **UNCHANGED**       |
| Database                        | **UNCHANGED** by agent                          |
| Secrets                         | **UNCHANGED**                                   |
| API keys                        | **UNCHANGED**                                   |
| Migrations applied by this work | **NONE** (migration exists in repo only)        |
| Deploy by this work             | **NONE**                                        |
| Merge                           | Requires human approval                         |

---

## Database status

- Latest multi-tenant migrations in repo through `20260902000046_phase6_ai_knowledge_isolation.sql`
- Phase 6 migration: coach convo/message RLS org filter + `match_knowledge` harden

---

## Migration status (multi-tenant program)

| Phase | Status                                      |
| ----- | ------------------------------------------- |
| 0     | Done (docs)                                 |
| 2–5   | Merged                                      |
| 6     | Implemented in repo — awaiting review       |
| 7–12  | Not started                                 |

---

## Documentation index

| File                                 | Role                              |
| ------------------------------------ | --------------------------------- |
| `ASCENDOS_CONSTITUTION.md`           | Binding architecture constitution |
| `MULTI_TENANT_ARCHITECTURE.md`       | Target architecture               |
| `SECURITY_MODEL.md`                  | Enforcement + gaps                |
| `ROLE_MODEL.md`                      | Roles current → target            |
| `DATA_MODEL.md`                      | Tenant-relevant tables            |
| `AI_KNOWLEDGE_ISOLATION.md`          | AI / knowledge rules              |
| `PHASE_5_EDGE_TENANT_DISCIPLINE.md`  | Phase 5 report                    |
| `PHASE_6_AI_KNOWLEDGE_ISOLATION.md`  | Phase 6 report                    |
| `PROJECT_STATE.md`                   | This file                         |
| `ADR/*.md`                           | Decision records                  |
