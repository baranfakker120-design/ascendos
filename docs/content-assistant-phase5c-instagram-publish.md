# Content Assistant Phase 5C — Instagram Graph Publishing

**Scope:** Official Content Publishing after explicit user confirmation in the Instagram preview.  
**Forbidden:** Scraping, passwords, bots, browser automation, tokens in the frontend.

## Flow

1. User prepares a draft (`status=ready`) and reviews the Instagram preview.
2. Two taps on **Jetzt auf Instagram veröffentlichen** (confirm + publish).
3. Client calls Edge `instagram-publish` with `{ action: "publish", draftId, confirmed: true }`.
4. Edge decrypts `token_ref`, creates a signed asset URL, creates a Graph media container, waits if needed, then `media_publish`.
5. Result stored in `content_publish_attempts` (`meta_container_id`, `meta_media_id`).

## Graph API (Instagram Login)

Host: `https://graph.instagram.com`  
Version: `v25.0` (same as Phase 5A `/me`)

| Step | Endpoint |
| ---- | -------- |
| Create container | `POST /{ig-user-id}/media` (`image_url` / `video_url`, optional `media_type`, `caption`) |
| Status (video/reel/story) | `GET /{container-id}?fields=status_code` until `FINISHED` |
| Publish | `POST /{ig-user-id}/media_publish` (`creation_id`) |

### Format mapping

| Draft format | Media | Graph |
| ------------ | ----- | ----- |
| feed | image | `image_url` + `caption` |
| feed / reel | video | `media_type=REELS` + `video_url` + `caption` |
| story | image/video | `media_type=STORIES` + url (no feed caption) |

## Permissions

| Scope | Required |
| ----- | -------- |
| `instagram_business_basic` | yes (connect) |
| `instagram_business_content_publish` | **yes (publish)** |

OAuth authorize now requests both scopes. Existing connections created with only `basic` must **reconnect** after Meta grants publish.

If publish scope is missing, Edge returns `missing_publish_permission` and does not create a Graph post.

## Idempotency

- Unique partial index on `content_publish_attempts(draft_id)` where `status in ('queued','submitted')`
- If a draft already has `published` + `meta_media_id`, Edge returns success without a second post
- Concurrent double-clicks return `already_in_progress` (HTTP 409)

## Deploy

```bash
supabase functions deploy instagram-publish --project-ref <ref> --no-verify-jwt --use-api
```

JWT is validated inside the function. Apply migration `20260822000035_content_publish_attempts_idempotency.sql`.

## Meta Developer Dashboard (manual)

1. Instagram product → request / grant **`instagram_business_content_publish`**
2. App Review / Advanced Access as required for production users
3. Ensure OAuth redirect URI unchanged (still `instagram-oauth`)
4. User reconnects Instagram in AscendOS so the new scope is stored on `content_instagram_connections.scopes`
