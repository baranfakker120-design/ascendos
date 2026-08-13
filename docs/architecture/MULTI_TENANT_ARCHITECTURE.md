# Multi-Tenant Architecture

**Status:** Phase 0 — target architecture (not yet fully implemented)  
**Date:** 2026-08-13  
**Authority:** `ASCENDOS_CONSTITUTION.md`

---

## 1. Goal

One AscendOS platform serving many organizations with **hard data isolation**, without forking infrastructure.

```
┌─────────────────────────────────────────────────────────┐
│ AscendOS Platform (single deploy / single Supabase)     │
│  Auth · Edge Functions · AI providers · VAPID · Meta    │
├─────────────────────────────────────────────────────────┤
│ Tenant plane                                            │
│  org A (current: Chogan / Team Seyda seed)              │
│  org B (future)                                         │
│  org C (future)                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Current vs target

| Concern               | Current (Phase 0 finding)                                                                       | Target                                             |
| --------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Tenant root           | `organizations` + `teams`                                                                       | Same; Team Seyda = normal org (or team inside org) |
| Auth unit             | `memberships` (identity ↔ org)                                                                  | Same; extend role vocabulary                       |
| Org selector          | `x-ascendos-org` → `current_org_id()`                                                           | Same; always forwarded by Edge                     |
| Isolation             | Strong on CRM/RAG/content; **weak** on Live Coaching / Knowledge Center / Stories / push outbox | All product domains org-scoped + RLS               |
| Brand / coach / links | Hardcoded Team Seyda surfaces                                                                   | Org branding + org links + org coach               |
| Platform admin        | Missing                                                                                         | `/platform-admin` + platform principal             |
| Org admin             | Partial (`super_admin` / developer gates)                                                       | `/admin` bound to current org                      |
| Infra                 | Single project `shaydtihwicnocjjlnjm`                                                           | **Keep** single project                            |

---

## 3. Request path (target)

```
Client
  → Auth session (JWT)
  → Active org header (x-ascendos-org)
  → PostgREST / RPC / Edge Function
       → active_membership_id() / current_org_id()
       → RLS / explicit org checks
       → Org-scoped data only
```

Edge Functions **must** forward `Authorization` and `x-ascendos-org` whenever they use the user JWT client.

Service-role / cron paths must still filter by `membership_id` / `org_id` explicitly — never “all rows”.

---

## 4. Data attachment rule

Every row that is organizationally owned must carry `org_id` (and often `owner_membership_id` / `membership_id`).

Exceptions only when data is truly platform-global (e.g. platform feature flags) — never coach knowledge, live events, or links of an org.

---

## 5. AI context boundary

```
User → Auth → Membership → Organization
  → Org RAG (knowledge_docs / chunks)
  → Org CMS knowledge (future: org-scoped articles)
  → Org agent / coach config
  → Prompt assembly (no other org data)
  → Central AI provider
  → Response
```

Provider keys remain platform secrets. Context is tenant-local.

---

## 6. Content systems (immutable product split)

| System            | Rule                                         |
| ----------------- | -------------------------------------------- |
| Autopilot feed    | Exactly **1 image**. Never auto-carousel.    |
| Manual carousel   | Manual only; up to **10** slides (existing). |
| Multi-tenant work | Must not re-merge these systems.             |

---

## 7. Branding plane (target)

Per organization: logo, name, colors, texts, images, icons, website, support info.  
Platform shell stays AscendOS; org skin applies after auth + org resolve.

---

## 8. Billing plane (deferred)

€20 / org / month + €2 / member. Architecture only — see Constitution §17.  
Optional usage meters per `organization_id` later.

---

## 9. Second organization readiness checklist (Phase 10)

Before onboarding a second real org:

- [ ] All tenant-relevant tables have `org_id` + RLS
- [ ] Knowledge Center / Live Coaching / Stories / push outbox org-scoped
- [ ] Edge functions forward org header or filter by membership
- [ ] No Team Seyda hardcoding on shared surfaces
- [ ] Isolation tests green (A cannot read B)
- [ ] Platform vs org admin separation live
- [ ] Seed/migration path for “Team Seyda as Org A” documented and reversible

---

## 10. Explicit non-goals (Phase 0+)

- Multiple Supabase projects
- Per-org AI keys
- Big-bang rewrite of CRM / genealogy / content
- Changing production secrets during Phase 0–1 docs/planning
