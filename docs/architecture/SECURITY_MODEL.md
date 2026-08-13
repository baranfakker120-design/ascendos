# Security Model — Multi-Tenant AscendOS

**Status:** Phase 0 — current + target  
**Date:** 2026-08-13  
**Authority:** `ASCENDOS_CONSTITUTION.md`

---

## 1. Principle

**Server-side enforcement only.** UI hiding is UX, not security.

A user must never obtain another organization’s data by:

- REST / PostgREST
- direct SQL via client
- RPC / SECURITY DEFINER functions
- Edge Functions
- knowledge / AI context
- admin interfaces
- manipulated URLs
- browser DevTools

---

## 2. Current enforcement stack

### 2.1 Membership resolution

| Helper                       | Behavior                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `active_membership_id()`     | Resolve from `x-ascendos-org` header (must match active membership) OR unique single membership; if ambiguous without header → **NULL** (deny) |
| `current_org_id()`           | Org of active membership                                                                                                                       |
| `current_user_role()`        | Role of active membership                                                                                                                      |
| `is_super_admin()`           | Membership role = `super_admin`                                                                                                                |
| `is_coach_content_manager()` | `super_admin` \| `developer`                                                                                                                   |

Client sets `x-ascendos-org` via `/workspace/src/shared/api/supabase.ts` and persists selection under `ascendos.activeOrg.<userId>`.

### 2.2 RLS pattern (mature domains)

Typical: `ENABLE ROW LEVEL SECURITY` + `org_id = current_org_id()` (+ ownership / role branches).

Strong today: contacts/pipeline (legacy CRM), RAG knowledge, coach convos (org + user), content assets/drafts/autopilot/IG connections, external tools, genealogy RPCs scoped to current org.

### 2.3 DEFINER RPCs

Must self-check org / membership. Never trust client-supplied `org_id` without membership proof. See historical F1 work and `docs/security-baseline.md`.

---

## 3. Known isolation gaps (Phase 0)

| Surface                                             | Gap                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `coach_knowledge_articles` (+ versions, change_log) | **No `org_id`**; approved articles readable by any authenticated user           |
| `live_coaching_events`                              | **No `org_id`**; active events global to all authed users                       |
| `ascend_stories`                                    | **No `org_id`**                                                                 |
| `coaching_notification_outbox`                      | **No `org_id`**; broad select policies historically                             |
| `push_subscriptions`                                | User-scoped only; dispatch not org-filtered                                     |
| `coach-chat` Edge                                   | May omit `x-ascendos-org` forwarding; can fall back to `profiles.org_id` mirror |
| `ingest-knowledge` Edge                             | Header handling must stay aligned with RLS                                      |
| Public `coaching-media` bucket                      | Public read of flyer media                                                      |

These are **blocking** for a second real organization.

---

## 4. Target enforcement rules

1. Every org-owned table: `org_id NOT NULL` + RLS using `current_org_id()` (or equivalent membership join).
2. Every user-JWT Edge Function: forward `Authorization` + `x-ascendos-org`.
3. Every service-role job: explicit `org_id` / `membership_id` filters; structured logging with org id; never `select *` across tenants for fan-out unless row is proven in-scope.
4. Platform admin actions: separate principal check (not `organizations.super_admin`).
5. Org admin actions: `current_org_id()` bound; cannot pass foreign `org_id`.
6. AI retrieval: `match_knowledge` (and successors) always receive server-resolved `p_org_id`, never a client-trusted free org id without membership check.
7. Storage paths: continue `{org_id}/…` prefixes; policies must enforce folder = `current_org_id()`.

---

## 5. Secrets & keys

- Never print secret **values** in docs, logs, PRs, or chat.
- Never put VAPID private key or service role key in frontend.
- Do not rotate / recreate platform secrets for multi-tenant work unless explicitly ordered.
- Document **names only** (see `PROJECT_STATE.md` / Phase 0 report).

---

## 6. Isolation test matrix (required before Phase 10)

| Case                                                     | Expected               |
| -------------------------------------------------------- | ---------------------- |
| Org A member reads A                                     | Allow                  |
| Org A member reads B                                     | Deny                   |
| Org B member reads B                                     | Allow                  |
| Org B member reads A                                     | Deny                   |
| Org admin manages only own org                           | Allow / Deny cross-org |
| Platform super admin manages orgs                        | Allow                  |
| Member hits admin APIs                                   | Deny                   |
| AI context / knowledge / live coaching / links / content | Tenant-isolated        |

Automated preference: pgTAP + Edge integration tests + RLS policy tests.

---

## 7. Related

- `ROLE_MODEL.md`
- `DATA_MODEL.md`
- `AI_KNOWLEDGE_ISOLATION.md`
- `docs/security-baseline.md`
- `docs/f1-security-analysis.md`
- `docs/f2-autorisierung-final.md`
