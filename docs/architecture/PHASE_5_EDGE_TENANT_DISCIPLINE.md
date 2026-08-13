# Phase 5 — Edge Function Tenant Discipline

**Status:** Implemented in repository (PR pending approval)  
**Date:** 2026-08-13  
**Production:** unchanged — no deploy / no merge without explicit approval

## Goal

User-JWT Edge Functions resolve organization via:

`JWT → x-ascendos-org → active membership → org-scoped DB/RAG/AI/Push`

Never via `profiles.org_id` alone. Service-role jobs must filter by `org_id` explicitly (RLS bypass).

## Shared helper

`supabase/functions/_shared/tenant.ts`

- `userClientFromRequest` — forwards `Authorization` + `x-ascendos-org`
- `resolveActiveMembership` / `pickActiveMembershipFromList`
- `assertClientOrgMatches` — reject body `organization_id` ≠ server org

Pure mirrors (unit-tested): `src/shared/auth/tenantResolve.ts`

## Edge audit

| Function               | User JWT? | Org Header? | Org Resolution?       | Service Role? | Org Filter?                             | Risk                       | Action      |
| ---------------------- | --------- | ----------- | --------------------- | ------------- | --------------------------------------- | -------------------------- | ----------- |
| coach-chat             | Yes       | Forwarded   | Membership            | No            | `activeOrgId` for agent/RAG/convo       | Was high (profiles.org_id) | **CHANGED** |
| ingest-knowledge       | Yes       | Forwarded   | Membership            | No            | writes `active.org_id`; body org denied | Was med                    | **CHANGED** |
| coaching-push-dispatch | Cron      | N/A         | event/outbox `org_id` | Yes           | memberships → subs                      | Was high (global fan-out)  | **CHANGED** |
| content-assistant      | Yes       | Forwarded   | Membership            | No            | yes                                     | Low                        | LEAVE       |
| content-autopilot      | Yes       | Forwarded   | Membership            | No            | yes                                     | Low                        | LEAVE       |
| content-autopilot-run  | Cron      | N/A         | per settings/slot     | Yes           | per org/membership                      | Low                        | LEAVE       |
| content-daily-prepare  | Cron      | N/A         | per membership        | Yes           | per org                                 | Low                        | LEAVE       |
| instagram-oauth        | Yes       | Forwarded   | Membership            | Yes (tokens)  | yes                                     | Low                        | LEAVE       |
| instagram-publish      | Yes       | Forwarded   | Membership            | Yes           | yes                                     | Low                        | LEAVE       |
| instagram-webhook      | Meta      | N/A         | N/A                   | No            | N/A                                     | Low                        | LEAVE       |
| validate-invite        | Anon      | N/A         | N/A                   | Yes           | invite RPC                              | Low                        | LEAVE       |
| meta-data-deletion     | Meta      | N/A         | by ig_user_id         | Yes           | matching rows                           | Low                        | LEAVE       |

## Out of scope (later phases)

- Frontend org switcher / Team Seyda hardcoding removal (Phase 6+)
- `/admin` / `/platform-admin` (Phase 7–8)
- Full removal of Chogan/Team Seyda strings in `_shared/prompts.ts` CORE_RULES (Phase 8 — runtime agents stay org-scoped from DB)
- coach-chat loading CMS `coach_knowledge_articles` into prompts (currently RAG `knowledge_docs` only; CMS is FE/local + RLS)
- Billing / second real organization / Storage path migration
- Autopilot / Manual Carousel behavior (unchanged)

## Security risks remaining

- Authed Edge Functions still rely on callers sending `x-ascendos-org` for multi-membership users (correct deny if missing)
- `service_role` cron paths must keep explicit org filters when new jobs are added
- Public `coaching-media` storage bucket still public-read (Storage phase)
- Prompt CORE_RULES still mentions Chogan/Team Seyda as product vocabulary (not org-switching authority)
