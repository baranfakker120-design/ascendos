# Role Model — Current → Target

**Status:** Phase 0  
**Date:** 2026-08-13  
**Authority:** `ASCENDOS_CONSTITUTION.md`

---

## 1. Target vocabulary (Constitution)

| Target role            | Scope      | Capabilities (summary)                                                              |
| ---------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `PLATFORM_SUPER_ADMIN` | Platform   | Create/manage/activate/deactivate orgs; platform settings; cross-org administration |
| `ORGANIZATION_ADMIN`   | Single org | Members, coaches, knowledge, links, branding, settings, content of **own** org only |
| `MEMBER`               | Single org | Use features granted for that org/role                                              |

Future org roles may include: `coach`, `manager`, `content_manager`, …  
**None** of these automatically imply platform super admin.

---

## 2. Current vocabulary (production schema)

From `memberships.role` / `profiles.role` CHECK (incl. developer role migration):

| Current role  | Typical meaning today                                                                  |
| ------------- | -------------------------------------------------------------------------------------- |
| `super_admin` | Org-level admin power (`is_super_admin()`); Wissen ingest UI; invite/admin writes      |
| `developer`   | With super_admin: coach content manager (`is_coach_content_manager()`); special frames |
| `admin`       | Present in enum; lightly used in RLS                                                   |
| `leader`      | Leadership / genealogy UX                                                              |
| `berater`     | Default consultant (**closest to target MEMBER**)                                      |

**There is no** DB role named `member` or `PLATFORM_SUPER_ADMIN` today.

Invite roles: `super_admin` \| `admin` \| `berater` \| `leader` (`developer` not inviteable).

Membership status: `pending` \| `active` \| `suspended` \| `ended`.

---

## 3. Mapping plan (non-binding until Phase 2 ADR)

| Target                 | Likely source                                            |
| ---------------------- | -------------------------------------------------------- |
| `MEMBER`               | `berater` (+ possibly `leader` as elevated member)       |
| `ORGANIZATION_ADMIN`   | today’s `super_admin` / `admin` **scoped to one org**    |
| `PLATFORM_SUPER_ADMIN` | **new** principal — must **not** equal org `super_admin` |

**Critical:** Today’s `super_admin` is **organization-scoped** in practice (membership row). It must **not** be silently treated as platform operator when Phase 8 ships.

Platform principal options (decide in Phase 2 ADR — do not implement now):

- separate table / claim (e.g. `platform_admins`)
- or dedicated flag outside `memberships.role`

---

## 4. Current UI gates (not security by themselves)

| Guard                        | Who                                 | Routes                                            |
| ---------------------------- | ----------------------------------- | ------------------------------------------------- |
| `RequireSuperAdmin`          | `membership.role === 'super_admin'` | `/wissen`                                         |
| `RequireCoachContentManager` | `super_admin` \| `developer`        | `/knowledge-center`, `/live-coaching`, `/stories` |

**Missing:** `/platform-admin`, `/admin` as dedicated org-admin shell.

Entry points: `/more` (Mehr).

---

## 5. Rules

1. Client role checks are UX; RLS / Edge must re-verify.
2. Org admin cannot see other orgs.
3. Platform admin is not granted by knowing a URL.
4. Do not collapse platform + org admin into one role.
5. Preserve existing Team Seyda operators’ ability to manage **their** org during migration.

---

## 6. Related code

- `/workspace/src/shared/types/domain.ts` — `UserRole`
- `/workspace/src/shared/auth/AuthProvider.tsx`
- `/workspace/src/shared/auth/membershipAuthority.ts`
- `/workspace/src/shared/auth/coachContentAuthority.ts`
- `/workspace/src/app/router.tsx`
- Migrations: `…00015_identity_and_membership.sql`, `…00022_developer_role_special_frames.sql`
