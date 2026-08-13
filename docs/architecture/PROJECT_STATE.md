# PROJECT_STATE — AscendOS Multi-Tenant

**Last updated:** 2026-08-13  
**Updated by:** Phase 0 architecture memory (documentation only)

---

## Current phase

**PHASE 0 — Bestandsaufnahme / Architecture Memory** — **COMPLETED (docs)**

---

## Last completed phase

Phase 0 documentation persisted under `docs/architecture/`.

---

## Next step

**PHASE 1 — Architektur + Datenmodell vertiefen**

- Finalize platform-principal ADR choice
- Table-level retrofit checklist sign-off
- Explicit approval required before any migration / deploy / merge of implementing work

---

## Current architecture stand (facts)

| Area                        | Status                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------ |
| Single Supabase project     | Yes — `shaydtihwicnocjjlnjm`                                                         |
| Organizations + memberships | Yes — seeded **1** org (Chogan) + Team Seyda                                         |
| Org selector                | `x-ascendos-org` + `current_org_id()`                                                |
| Roles                       | `super_admin`, `admin`, `leader`, `berater`, `developer` (no platform principal yet) |
| RAG knowledge isolation     | Org-scoped                                                                           |
| Knowledge Center CMS        | **Global** (gap)                                                                     |
| Live Coaching               | **Global** (gap)                                                                     |
| Ascend Stories              | **Global** (gap)                                                                     |
| Content / Autopilot / IG    | Org-scoped; Autopilot feed = 1 image; Manual carousel ≤ 10                           |
| Web Push                    | Central VAPID; subscriptions user-scoped; outbox not org-scoped                      |
| Platform Admin UI           | **Missing**                                                                          |
| Team Seyda hardcoding       | Present (route, iframe, Mehr, prompts, seed tools)                                   |

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

1. Second org would leak Live Coaching / Knowledge Center / Stories today
2. `coach-chat` may not always honor `x-ascendos-org`
3. Push dispatch can fan out globally relative to global events
4. Org `super_admin` must not be confused with future platform super admin
5. Brand hardcoding (Team Seyda) will confuse second org UX
6. Historical migration gaps on some production tracks — follow existing “no gap push” discipline
7. OpenRouter / Gemini credits are platform cost centers (usage metering later)

---

## Production status

| Item                            | State                                               |
| ------------------------------- | --------------------------------------------------- |
| Production app                  | Live (Cloudflare Pages: `ascendseyda` / `ascendos`) |
| This Phase 0 work               | **Documentation only — production UNCHANGED**       |
| Database                        | **UNCHANGED** by Phase 0                            |
| Secrets                         | **UNCHANGED**                                       |
| API keys                        | **UNCHANGED**                                       |
| Migrations applied by this work | **NONE**                                            |
| Deploy by this work             | **NONE**                                            |
| Merge                           | Requires human approval                             |

---

## Database status

- Migrations in repo: **42** (`20260721000001` … `20260829000042`)
- Tenancy foundation present since early migrations + identity/membership (15+)
- Content autopilot: `…00040`; live coaching push forward: `…00041`; asset library 50: `…00042`

---

## Migration status (multi-tenant program)

| Phase | Status      |
| ----- | ----------- |
| 0     | Done (docs) |
| 1–10  | Not started |

---

## Deployment status

| Channel          | Notes                                                                             |
| ---------------- | --------------------------------------------------------------------------------- |
| Cloudflare Pages | Primary host (`ascendseyda`, `ascendos`)                                          |
| Netlify          | Historical / preview drift in some docs; not primary                              |
| Edge Functions   | Deployed to project `shaydtihwicnocjjlnjm` as part of normal ops (not by Phase 0) |

---

## Documentation index

| File                           | Role                              |
| ------------------------------ | --------------------------------- |
| `ASCENDOS_CONSTITUTION.md`     | Binding architecture constitution |
| `MULTI_TENANT_ARCHITECTURE.md` | Target architecture               |
| `SECURITY_MODEL.md`            | Enforcement + gaps                |
| `ROLE_MODEL.md`                | Roles current → target            |
| `DATA_MODEL.md`                | Tenant-relevant tables            |
| `AI_KNOWLEDGE_ISOLATION.md`    | AI / knowledge rules              |
| `MIGRATION_PLAN.md`            | Phases 0–10                       |
| `PROJECT_STATE.md`             | This file                         |
| `ADR/*.md`                     | Decision records                  |

Also still relevant: `docs/ASCENDOS_CONSTITUTION_v1.md` (product philosophy), `docs/security-baseline.md`, `docs/f2-autorisierung-final.md`.
