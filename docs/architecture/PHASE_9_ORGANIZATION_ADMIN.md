# PHASE 9 — Organization Admin Panel

**Status:** Implemented in repository (awaiting human review)  
**Branch:** `cursor/phase-9-organization-admin-c4aa`  
**Production:** Unchanged — no deploy, no production migration apply

---

## Goal

Dedicated `/admin` shell for **ORGANIZATION_ADMIN** of the **active organization** only.  
`PLATFORM_SUPER_ADMIN` / `/platform-admin` remain Phase 10.

---

## Route & UX gate

- `/admin/*` — `RequireOrganizationAdmin` (membership role `super_admin` | `admin`)
- Members hitting `/admin` see forbidden copy (no admin data load intended)
- `/platform-admin` — always denied in Phase 9 (org admins cannot open platform admin)
- Entry: More → Organization Admin

Server truth: RLS + RPCs bound to `current_org_id()` / `active_membership_id()`.

---

## Features

| Area                                 | Status                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Organization read                    | PASS — name vs `branding.display_name`                                  |
| Branding edit                        | PASS — `org_admin_update_branding` (never changes `organizations.name`) |
| Members / roles / status             | PASS — list + RPCs                                                      |
| Invites                              | PASS — `create_invite` (active org)                                     |
| Tools                                | PASS — `org_admin_upsert_external_tool`                                 |
| Coach                                | PASS — branding coach name + agent prompts                              |
| Knowledge / Content / Live / Stories | PASS — hubs linking existing org-scoped UIs (gated by existing roles)   |

---

## Security migration

`20260905000049_phase9_org_admin_writes.sql`

- Widen write policies to `is_organization_admin()`
- Protect `organizations.name`
- Org-admin profile/tool/invite visibility
- RPCs: branding, tools, membership role/status, agents

---

## Out of scope

- Phase 10 Platform Admin
- Phase 11 Billing
- Phase 12 Second production org
- Autopilot / Manual Carousel / AI keys
