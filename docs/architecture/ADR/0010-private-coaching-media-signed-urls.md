# ADR 0010 — Private coaching-media + signed URLs

**Status:** Accepted (implemented Phase 7)  
**Date:** 2026-08-13

## Context

`coaching-media` was a **public** bucket with unauthenticated SELECT. Permanent `media_url` values leaked Org A flyers to anyone with the URL. Table RLS on `live_coaching_events` cannot protect Storage objects.

## Decision

1. Bucket `coaching-media` is **private** (`public = false`).
2. Clients load media via **signed URLs** created with the caller JWT (Storage RLS applies).
3. New object paths use `{org_id}/…`.
4. Legacy paths (`{userId}/…`) remain readable only when referenced by an event/story in `current_org_id()` (dual-read; no production object rewrite).
5. Writes require `is_coach_content_manager()` and org-folder match.

## Consequences

- Additive migration only — no DROP of media rows/objects.
- Frontend stops relying on `getPublicUrl` for coaching flyers.
- Historical public URLs stop working once the bucket is private in an environment (expected).
