# Data Model — Tenant Relevance

**Status:** Phase 0 inventory  
**Date:** 2026-08-13  
**Authority:** `ASCENDOS_CONSTITUTION.md`  
**Source of truth:** `supabase/migrations/` (42 files) + `src/shared/types/database.types.ts`

---

## 1. Tenant root

| Table | Tenant key | Notes |
|---|---|---|
| `organizations` | `id` | Seed org: Chogan (`00000000-0000-0000-0000-000000000001`) |
| `teams` | `org_id` | Seed team: Team Seyda (`…000011`) |
| `memberships` | `org_id`, `identity_id` | Canonical authorization unit |
| `profiles` | mirrored `org_id` / `role` / `team_id` | Identity display; mirror of active membership |
| `invites` | `org_id` | Join codes |

**Note:** Product language sometimes mentions Essence Tribe; there is **no** Essence Tribe table — only org + team.

---

## 2. Strongly org-scoped today (keep & harden)

| Domain | Tables (representative) |
|---|---|
| CRM | `contacts`, pipeline events, daily plan artifacts |
| RAG Knowledge | `knowledge_docs`, `knowledge_chunks`, `knowledge_gaps`, `agents` |
| Coach chat | `coach_convos`, `coach_messages` (via convo), `usage_events` |
| Tools / Mehr | `external_tools` |
| Content | `content_assets`, `content_drafts`, `content_daily_preparations`, `content_instagram_connections`, `content_facebook_business_connections`, `content_publish_attempts`, `content_autopilot_*` |
| Genealogy / AP | genealogy views/RPCs bound to `current_org_id()`; AP economy tables via membership |
| Storage | `content-assets` path `{org_id}/…` |

---

## 3. Not org-scoped today (must gain `org_id` before multi-org)

| Table / object | Current gate | Risk |
|---|---|---|
| `coach_knowledge_articles` (+ versions, change_log) | Role / approved | Cross-org CMS leak |
| `live_coaching_events` | Role / active | Cross-org events/flyers |
| `ascend_stories` | Role / published | Cross-org stories |
| `coaching_notification_outbox` | Global / loose | Cross-org notification text |
| `push_subscriptions` | `user_id` only | Shared push pool; OK if user∈one org, risky if multi-org identity |
| Storage `coaching-media` | Public read | URL leakage |

---

## 4. Brand / hardcoding outside tables

Not DB rows but product data that must become org-config:

| Location | Content |
|---|---|
| `src/features/team-seyda/TeamSeydaPage.tsx` | Iframe `teamseydaguide.netlify.app` |
| `src/features/more/MorePage.tsx` | Team Seyda links / admin entries |
| `src/shared/lib/shareToolsDisplay.ts` | WayToMoon / presentation tool URLs |
| Seed / bootstrap | Chogan, Team Seyda, founder invite codes, Netlify tool URLs |
| Coach prompts (`_shared/prompts.ts`) | Chogan / Team Seyda phrasing |
| i18n catalogs | `teamSeyda.*` strings |

Target: org settings / `organizations.branding` / `external_tools` / org link catalog — no hardcoded brand in shared code paths.

---

## 5. Content dual-system columns

| Concern | Model |
|---|---|
| Manual carousel | `content_drafts.carousel_asset_ids` (≤10) |
| Autopilot | Slots/drafts force **single** asset; `carousel_asset_ids` cleared on Autopilot path |

Do not unify these systems in schema refactors without an ADR.

---

## 6. Identity model (Weg 1)

Operational rows often store `(user_id|owner_id, org_id)` rather than FK to `memberships.id`. Newer content features add `owner_membership_id` / `membership_id`.

Long-term preference: membership-aware ownership where authorization is membership-scoped; keep mirror profile for display.

---

## 7. Seed IDs (non-secret)

| Entity | UUID | Name |
|---|---|---|
| Organization | `00000000-0000-0000-0000-000000000001` | Chogan |
| Team | `00000000-0000-0000-0000-000000000011` | Team Seyda |
| Journey | `00000000-0000-0000-0000-000000000021` | 7-day journey |

Files: `supabase/seed.sql`, `setup/bootstrap.sql`.

---

## 8. Related

- `MULTI_TENANT_ARCHITECTURE.md`
- `SECURITY_MODEL.md`
- `AI_KNOWLEDGE_ISOLATION.md`
