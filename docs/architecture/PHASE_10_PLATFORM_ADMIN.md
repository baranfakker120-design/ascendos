# PHASE 10 — Platform Admin Panel

**Status:** Implemented in repository (awaiting human review)  
**Branch:** `cursor/phase-10-platform-admin-c4aa`  
**Production:** Unchanged — no deploy, no production migration apply, no second production org

---

## Goal

Dedicated `/platform-admin` shell for **PLATFORM_SUPER_ADMIN** only (`platform_admins` + `is_platform_super_admin()`).

Organization Admin (`/admin`) remains org-scoped and cannot access platform controls.

---

## Authority

| Gate      | Source                                                      |
| --------- | ----------------------------------------------------------- |
| Platform  | `platform_admins` / `is_platform_super_admin()`             |
| Org admin | `memberships.role` ∈ {`super_admin`,`admin`} for active org |

Never: `is_super_admin()`, `profiles.role`, or FE flags alone.

---

## Features

| Area                            | Status                                            |
| ------------------------------- | ------------------------------------------------- |
| Organization list               | PASS — platform RPC                               |
| Create organization             | PASS — atomic org + neutral branding + Main Team  |
| Deactivate / reactivate         | PASS — no hard delete                             |
| Organization detail             | PASS — counts + branding status                   |
| Org-admin invite                | PASS — invite bound to target `org_id`            |
| Platform admins list/add/revoke | PASS — last-admin protection                      |
| Usage overview                  | PASS — aggregated `usage_events`                  |
| Platform settings               | PASS — metadata only (`configured` / `connected`) |
| Billing                         | NOT IMPLEMENTED (Phase 11)                        |

---

## Security migration

`20260906000050_phase10_platform_admin.sql`

- `organizations.status` (`active` \| `inactive`)
- Inactive orgs excluded from `active_membership_id()`
- Platform RPCs: list/create/status/detail/invite/admins/usage/config
- Audit via `usage_events` platform event types

---

## Out of scope

- Phase 11 Billing / Stripe
- Phase 12 Second production organization
- Production migration apply / deploy / merge
- Autopilot / Manual Carousel / AI keys / VAPID / Meta changes
