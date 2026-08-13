# Phase 7 — Live Coaching + Push + Stories Isolation

**Status:** Implemented in repository (awaiting human review)  
**Date:** 2026-08-13  
**Production:** unchanged — no deploy / no merge without explicit approval

## Goal

```
Org A → Live A + Push A + Stories A + Media A
Org B → Live B + Push B + Stories B + Media B
```

Central VAPID / AI / Meta unchanged.

## Data flow

```
Event create (RLS: current_org_id)
 → live_coaching_events.org_id
 → coaching_notification_outbox (trigger copies event.org_id)
 → cron coaching-push-dispatch (service_role)
 → resolveDispatchOrgId(outbox, event)
 → active memberships in event.org_id
 → push_subscriptions for those users
 → Web Push
```

Stories: FE queries under RLS only (no push path).

## Boundaries

| Surface         | Boundary                                                         |
| --------------- | ---------------------------------------------------------------- |
| Live events     | Phase 4 RLS `org_id = current_org_id()`                          |
| Outbox          | Phase 3 trigger + Phase 4 RLS; Phase 7 deny send on org mismatch |
| Push recipients | Phase 5 filter; Phase 7 matrix tests + import fix                |
| Stories         | Phase 4 RLS; query keys include active org                       |
| Storage         | Phase 7 private bucket + org SELECT/INSERT + signed URLs         |

## Migration

`20260903000047_phase7_coaching_media_private.sql`

- `coaching-media.public = false`
- drop `coaching_media_public_read`
- org-scoped storage policies (new `{org_id}/…` + legacy via event/story reference)

## Edge fix

`coaching-push-dispatch` now imports `sendWebPushToSubscription` and skips rows when `outbox.org_id ≠ event.org_id`.

## Frontend (minimal)

- Upload path `{org_id}/{actor}/…`
- Signed URL via `createSignedUrl` / `useCoachingMediaUrl`
- React Query keys include `membership.org_id` for live + stories

## ADRs

- `0008` — user-level subscriptions; org filter at send
- `0010` — private coaching-media + signed URLs

## Remaining risks

- Legacy public URLs in DB become inert after bucket is private (expected)
- No Edge E2E against real VAPID in this run
- FE brand hardcoding / admin UIs / billing / second production org (later phases)
- Autopilot / Manual Carousel untouched

## Unchanged

AI providers, API keys, secrets, VAPID infrastructure, Autopilot, Manual Carousel, Billing, Admin UIs.
