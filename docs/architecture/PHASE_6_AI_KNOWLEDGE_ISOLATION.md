# Phase 6 — Knowledge + AI Isolation

**Status:** Implemented in repository (awaiting human review)  
**Date:** 2026-08-13  
**Production:** unchanged — no deploy / no merge without explicit approval

## Goal

Prove:

`ORGANIZATION A → only A AI context`  
`ORGANIZATION B → only B AI context`

Central AI providers/keys unchanged.

## AI context chain (enforced)

```
Authenticated user
 → active membership (x-ascendos-org / single-membership)
 → current org
 → org agent
 → org RAG knowledge (match_knowledge)
 → org conversation history
 → org-specific prompt blocks
 → central AI provider
 → usage_events(org_id = active org)
```

Never: `profiles.org_id` as authorization.

## Guarantees

| Surface                  | Guarantee                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `match_knowledge`        | `p_org_id` must equal `current_org_id()`; org filter inside retrieval (docs + chunks); no `is_super_admin` bypass |
| Agents                   | Selected with `org_id = activeOrgId`                                                                              |
| Conversations / messages | RLS `user_id` **and** `org_id = current_org_id()`; Edge also filters by `activeOrgId`                             |
| Knowledge gaps           | Existing org-scoped admin select preserved                                                                        |
| CMS articles             | RLS org-scoped (Phase 4). **Not loaded into coach-chat prompts** (RAG only)                                       |
| Usage                    | `usage_events.org_id = activeOrgId`                                                                               |
| Ingest                   | Phase 5 tenant discipline unchanged                                                                               |

## Migration (required)

`20260902000046_phase6_ai_knowledge_isolation.sql`

Required because multi-org users could previously `SELECT` foreign `coach_convos` / `coach_messages` (USING was `user_id` only). That history would enter the AI prompt.

Also hardens `match_knowledge` p_org_id validation and adds `c.org_id = p_org_id`.

## Hard-code audit

| Item                           | Class               | Action                                           |
| ------------------------------ | ------------------- | ------------------------------------------------ |
| `CORE_RULES` Chogan/Team Seyda | D — AI context leak | Minimal neutralize (generic product/org wording) |
| Intent rewrite `Chogan Parfum` | D — embedding bias  | Minimal neutralize (`Parfum Duft…`)              |
| coach-chat WayToMoon UI labels | B — Org-1 UX        | OUT OF SCOPE — Phase 8                           |
| Seed/docs Team Seyda           | C — historical      | OUT OF SCOPE — Phase 8                           |

## CMS in coach-chat

Investigation: CMS (`coach_knowledge_articles`) is a FE Knowledge Center surface with Phase-4 RLS. Coach-chat architecture remains **RAG `knowledge_docs` only**. Wiring CMS into prompts would be a new feature, not an existing coach path — **NOT IMPLEMENTED** in Phase 6.

## Tests

- Unit: `src/shared/ai/promptIsolation.test.ts`, `hardcodeAudit.test.ts`, tenantResolve conversation helper
- pgTAP: `supabase/tests/database/phase6_ai_knowledge_isolation.test.sql`

## Remaining risks

- Public `coaching-media` storage (later Storage phase)
- Frontend org switcher / brand hardcoding (Phase 8+)
- Admin UIs (Phase 9–10)
- Billing (Phase 11)
- Second production organization (Phase 12)
- `coach_messages_today` still counts across orgs for the daily limit (platform cost control; not AI context)

## Unchanged

AI providers, API keys, Autopilot, Manual Carousel, Frontend redesign, Billing, Storage migration, Production DB.
