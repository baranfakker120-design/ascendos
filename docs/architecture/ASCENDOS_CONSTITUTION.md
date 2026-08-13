# AscendOS Constitution

**Status:** Binding architecture & product authority for multi-tenant AscendOS  
**Effective:** 2026-08-13 (Phase 0 — documentation only)  
**Location:** `docs/architecture/ASCENDOS_CONSTITUTION.md`  
**Audience:** Humans and AI agents building AscendOS

---

## 0. Authority

1. This Constitution and the sibling documents under `docs/architecture/` are the **binding technical architecture memory** for AscendOS multi-tenancy.
2. Product philosophy in `docs/ASCENDOS_CONSTITUTION_v1.md` remains in force for product vision, UX philosophy, and change discipline where it does **not** conflict with this architecture memory.
3. Where this architecture memory and older notes, tickets, or chat prompts conflict, **this architecture memory wins**.
4. Where this memory and the live repository conflict on **facts**, resolve against the repository, then update these docs in a dedicated documentation PR.
5. AI agents and contractors are bound by the same rules. “The prompt asked for it” is not authority over these documents.
6. If a future task contradicts these rules: **STOP**, explain the conflict, do **not** decide unilaterally.

---

## 1. Builder role

ChatGPT and the product owner define: product vision, architecture, security model, data model, roles, multi-tenant rules, phases, priorities.

The Cursor agent / engineer is the **Builder**: implement approved decisions; do **not** silently change architecture.

If unclear: **STOP and ask. Do not guess.**

---

## 2. Product vision — one platform, many organizations

AscendOS is a **single** multi-tenant platform:

- one app
- one Supabase project
- one backend / Edge Function set
- many fully isolated **organizations**

```
ASCENDOS
├── Organisation A (e.g. Team Seyda / current production tenant)
├── Organisation B
├── Organisation C
└── …
```

Each organization owns its own data and settings.

---

## 3. Team Seyda is not special-case logic

**Hard rule:** Team Seyda becomes a **normal organization**.

Forbidden long-term patterns for org-specific product data:

- `if organization === "seyda"`
- `const coach = "Seyda"`
- `const company = "Essence Tribe"`
- hardcoded `TEAM_SEYDA_LINKS` (or equivalent) for org-owned links

Required pattern: `currentOrganization` + organization-scoped data.

Team Seyda must keep working after migration. Existing data must be preserved.

---

## 4. Organization separation

Every organization has a unique `organization_id` (`organizations.id` today).

All relevant org data attaches to that ID: users/memberships, coaches, knowledge, links, content, live coaching, branding, settings, social accounts, etc.

Organisation B must **never** see Organisation A data — not via REST, direct queries, RPC, Edge Functions, knowledge/AI context, admin UI, manipulated URLs, or DevTools.

---

## 5. Security — multi-tenancy is server-enforced

**Not sufficient:** hidden buttons, hidden routes, `display:none`, client-only filters, URL slugs, “users just don’t see it”.

**Required:** Supabase RLS, server-side authorization, role checks, `organization_id`, tenant-aware queries / RPCs / Edge Functions.

---

## 6. Role model (target)

Three mandatory levels (target vocabulary; see `ROLE_MODEL.md` for current → target mapping):

| Level                  | Purpose                                                                           |
| ---------------------- | --------------------------------------------------------------------------------- |
| `PLATFORM_SUPER_ADMIN` | Platform operator: create/manage/disable orgs; platform settings; cross-org admin |
| `ORGANIZATION_ADMIN`   | Admin of **one** org only                                                         |
| `MEMBER`               | Normal consultant/user within org capabilities                                    |

No org role automatically becomes platform super admin. Later roles (`coach`, `manager`, `content_manager`, …) may be added without elevating to platform.

---

## 7. Platform Admin Panel (target)

Long-term route: `/platform-admin`.

The route is **not** security. Server must verify: authenticated **and** platform super admin → else 403.

Organization admins must **not** use this panel.

---

## 8. Organization Admin (target)

Org-scoped admin (e.g. `/admin`) must bind to `currentOrganization` only.

---

## 9. Central infrastructure — hard constraint

**DO NOT create:**

- new Supabase project per org
- new Supabase API keys per org
- separate AI API keys per org
- separate central backends per org

**KEEP central:**

- current Supabase project
- existing Supabase API keys
- existing AI/API configuration & secrets
- existing Edge Functions
- existing VAPID infrastructure
- existing OAuth / Meta / Instagram / Autopilot infrastructure

Multi-tenancy = **data + permission isolation**, not infra forks.

Do not change secrets / keys unless an explicit later task demands it.

---

## 10. AI / Knowledge

AI **infrastructure** stays central. AI **context** must be organization-scoped.

Same question (“Who is our coach?”) → different org knowledge → different answers.

Global shared knowledge for all orgs is a **critical security bug**.

Flow: User → Auth → Organization → Org Knowledge → AI Context → AI → Response.

---

## 11–16. Domain isolation (summary)

| Domain              | Rule                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Coach data          | Org-scoped; never assume coach = Seyda                                                                     |
| Links / Mehr        | Org-scoped                                                                                                 |
| Branding            | Org-scoped (logo, name, colors, texts, …)                                                                  |
| Live Coaching       | Org-scoped (events, flyers, push, zoom, replay, …)                                                         |
| Content / Autopilot | Org-scoped; **Autopilot feed = exactly 1 image**; **Manual carousel ≤ 10** — never mix                     |
| Web Push            | Central VAPID stays; private keys never in frontend; subscriptions/events org-aware when data is org-owned |

---

## 17–18. Billing & usage (architecture only)

Planned: **€20 / org / month + €2 / advisor**. Not implementing now.

Optional later: usage tracking per `organization_id` (AI/API/automation). Still **no** per-org API keys.

---

## 19. Protect existing functions

Protect during refactor: Auth, Profiles, Knowledge, Content Assistant, Autopilot, Manual Carousel, Live Coaching, Web Push, OAuth, Meta/Instagram, Edge Functions, RLS, Secrets, existing data.

No unnecessary refactors.

---

## 20. Migration discipline

No Big Bang. Phased plan in `MIGRATION_PLAN.md`. Preserve Team Seyda behavior and data.

---

## 21. Change discipline

- No silent architecture changes
- No new frameworks without approval
- No new Supabase projects / API keys
- No secret/key rotation without explicit approval
- No migration / production / deploy / merge without explicit approval
- Rollback thinking for every migration
- Test strategy must prove A↔B isolation for data, admin, AI, knowledge, live coaching, links, content

---

## 22. Mandatory pre-work for every future AscendOS task

Before executing a future task:

1. Read this Constitution
2. Read `PROJECT_STATE.md`
3. Read relevant architecture docs + ADRs
4. Inspect repository state
5. Then plan

Update docs / ADRs when decisions change.

---

## Related documents

| Doc                                | Purpose                         |
| ---------------------------------- | ------------------------------- |
| `MULTI_TENANT_ARCHITECTURE.md`     | Target architecture             |
| `SECURITY_MODEL.md`                | Enforcement model               |
| `ROLE_MODEL.md`                    | Roles current → target          |
| `DATA_MODEL.md`                    | Tables & tenant relevance       |
| `AI_KNOWLEDGE_ISOLATION.md`        | AI / RAG / CMS isolation        |
| `MIGRATION_PLAN.md`                | Phases 0–10                     |
| `PROJECT_STATE.md`                 | Living status                   |
| `ADR/`                             | Architecture Decision Records   |
| `docs/ASCENDOS_CONSTITUTION_v1.md` | Product philosophy constitution |
