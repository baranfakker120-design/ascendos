# ADR 0008 — User-level push subscriptions; org filter at send time

**Status:** Accepted (implemented Phases 5–7)  
**Date:** 2026-08-13

## Context

Multi-org users may have one device subscription but memberships in several organizations. Attaching `org_id` to every `push_subscriptions` row would duplicate devices per org and complicate enable/disable UX.

## Decision

1. `push_subscriptions` remain **user/device scoped** (`user_id = auth.uid()`).
2. Isolation happens at **send time**:
   `event.org_id → active memberships → push_subscriptions → Web Push`.
3. VAPID keys stay **central** (platform secrets). Private key never in the frontend.
4. Cron/`service_role` dispatch must apply the membership filter explicitly (RLS bypass).

## Consequences

- Phase 5 introduced `filterSubscriptionsForOrg`.
- Phase 7 hardens outbox/event org consistency before recipient selection.
- Do not add per-org subscription rows unless a future product requirement forces it.
