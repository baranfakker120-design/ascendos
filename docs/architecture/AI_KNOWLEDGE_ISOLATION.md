# AI & Knowledge Isolation

**Status:** Phase 0  
**Date:** 2026-08-13  
**Authority:** `ASCENDOS_CONSTITUTION.md`

---

## 1. Hard rules

1. AI **providers and keys** stay **central** (platform secrets).
2. AI **context** is always **organization-scoped**.
3. Never assemble a prompt from another org’s knowledge, coach profile, links, or live events.
4. “Who is our coach?” must resolve from the **caller’s** organization only.

Violation of (2)–(4) is a **critical security bug**.

---

## 2. Two knowledge systems today

| System | Tables | Org-scoped? | Used by |
|---|---|---|---|
| **RAG Knowledge** | `knowledge_docs`, `knowledge_chunks`, `knowledge_gaps`, `agents` | **Yes** | Coach chat (`match_knowledge`), `/wissen` ingest |
| **Knowledge Center CMS** | `coach_knowledge_articles`, versions, change_log | **No** | `/knowledge-center`, coach surfaces reading approved articles |

Target: CMS must become org-scoped like RAG (or be explicitly platform-only with a separate ADR — default is **org-scoped**).

---

## 3. Required AI flow (target)

```
User
 → Authentication (JWT)
 → Organization (active membership / x-ascendos-org)
 → Organization Knowledge (RAG + org CMS + org agent)
 → Prompt / tool context (tenant-only)
 → Central AI (Gemini / OpenRouter / …)
 → Response
 → Optional usage_events(org_id, …)
```

---

## 4. Current Edge / client surfaces

| Surface | Path | Tenant notes |
|---|---|---|
| Coach chat | `supabase/functions/coach-chat` | Must resolve org via header; risk if using profile mirror only |
| Ingest | `supabase/functions/ingest-knowledge` | Super admin + org; embeddings 1536-d |
| Content vision | `content-assistant` / shared `content-generate` | Org assets; OpenRouter |
| Autopilot optimize | `content-autopilot-run` | Membership/org filtered; service role |
| Client coach | `src/features/coach/` | Uses Edge |
| Client RAG admin | `src/features/knowledge/` | `/wissen` |
| Client CMS | `src/features/knowledge-center/` | Global today |

---

## 5. Coach identity

- Forbidden: global `coach = Seyda`.
- Target: org coach profile / agent persona from `agents` + org branding.
- Preserve Team Seyda coach data as Org A data during migration.

---

## 6. Provider inventory (names only)

| Secret / config name | Domain |
|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FAST_MODEL` | Coach / ingest |
| `OPENROUTER_API_KEY` | Content vision (+ optional coach router) |
| `CEREBRAS_API_KEY`, `GROQ_API_KEY` | Optional AI routers |
| `SUPABASE_*` | Platform |

No per-org copies of these keys.

---

## 7. Isolation tests (AI-specific)

- Org A query never retrieves Org B chunks.
- Org A Knowledge Center never lists Org B articles.
- Coach prompt assembly unit tests reject foreign `org_id`.
- Edge integration: wrong header → empty/deny, not other org data.

---

## 8. Related ADRs

- `ADR/0001-central-infra-tenant-data.md`
- `ADR/0002-team-seyda-as-normal-org.md`
- `ADR/0003-ai-context-org-scoped.md`
