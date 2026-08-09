# Content Assistant Phase 5D — Instagram Reels + Audio capability

**Scope:** Official Reels publishing via the existing Instagram Login OAuth + `instagram-publish` Edge Function.  
**Forbidden:** Scraping, passwords, bots, browser automation, unofficial endpoints, fake music pickers, secrets in the frontend.

Phase 5C feed publishing remains unchanged. This phase hardens the Reels path and documents official Audio limits.

## Analysis (Schritt 1)

| Item                                     | Status                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Instagram OAuth (`instagram-oauth`)      | Unchanged — Business Login for Instagram                                                    |
| Scopes                                   | `instagram_business_basic` + `instagram_business_content_publish`                           |
| Graph host / version                     | `https://graph.instagram.com` / `v25.0`                                                     |
| Edge `instagram-publish`                 | Extended additively for Reels validation + `share_to_feed`                                  |
| Signed asset URLs                        | Same `content-assets` bucket, 7200s signed URL                                              |
| `content_publish_attempts` + idempotency | Preserved (unique active draft, early `meta_container_id`, re-check before `media_publish`) |
| Preview UI                               | Reel-aware chrome + audio “not available” notice                                            |
| i18n                                     | de / en / tr / pl keys for Reels + video errors                                             |

## Official Reels flow

```
AscendOS Video → Instagram Preview → User two-tap confirm
  → Edge instagram-publish
  → validate MP4 / size / dims (when known)
  → POST /{ig-user-id}/media (media_type=REELS, video_url, caption, share_to_feed=true)
  → store meta_container_id
  → poll status_code until FINISHED|PUBLISHED
  → POST /{ig-user-id}/media_publish
  → store meta_media_id
```

### Video requirements used for validation

From Meta **IG User Media — Reel Specifications** (and Story Video Specifications for Stories):

| Check        | Reels                            | Stories (video) |
| ------------ | -------------------------------- | --------------- |
| Container    | MP4 or MOV                       | MP4 or MOV      |
| Duration     | 3 s – 15 min                     | 3 s – 60 s      |
| File size    | ≤ 300 MB                         | ≤ 100 MB        |
| Max width    | 1920 px                          | 1920 px         |
| Aspect ratio | 0.01:1 – 10:1 (9:16 recommended) | same family     |

AscendOS upload already caps files at 50 MB. **WebM is rejected at publish** (not a Meta Reel container). Codec/FPS/bitrate are not fully probeable without binary analysis; Meta still validates those during container processing.

## Official Audio / Music — NOT available with current OAuth

Meta changelog (**Instagram Audio API**, June 2026): the API is for apps using **Facebook Login**.

| Capability                                              | With current Instagram Login? |
| ------------------------------------------------------- | ----------------------------- |
| A) Search music (`GET /ig_audio?audio_type=music`)      | **No**                        |
| B) Select from Meta Sound Collection                    | **No**                        |
| C) Select original sounds (`audio_type=original_sound`) | **No**                        |
| D) Attach library audio to a Reel at creation           | **No**                        |
| E) Fetch audio metadata (`GET /{ig_audio_id}`)          | **No**                        |
| F) Reference library audio when publishing              | **No**                        |

What _is_ supported on Reels containers without Audio API:

- The video’s **original embedded audio** is published with the Reel.
- Optional Graph field `audio_name` only **renames** original audio — it is **not** Music library selection. AscendOS does not expose a fake picker.

### What would be required for official music

1. A separate **Facebook Login for Business** path (Page-linked Instagram Professional account).
2. Graph host `graph.facebook.com` for Audio endpoints (not only `graph.instagram.com`).
3. Meta App Dashboard products / permissions for Facebook Login + Instagram with Facebook Login.
4. Likely additional App Review.

**Decision:** Do **not** rework Phase 5A/5C OAuth. UI shows a clear “Musik noch nicht verfügbar” notice. No simulated track list.

## Idempotency & safety (unchanged principles)

- Two-tap confirm; no auto-publish
- Double-click / parallel → `already_in_progress` or resume same `meta_container_id`
- Already `published` + `meta_media_id` → success, no second post
- Tokens / secrets never returned to the frontend

## Deploy (manual — not automated by this phase)

```bash
npm run generate
supabase functions deploy instagram-publish --project-ref <ref> --no-verify-jwt --use-api
```

No new DB migration required for Phase 5D. OAuth Edge Function should remain at the Phase 5C revision unless Meta Dashboard work changes scopes (not required for Reels publishing).

## Meta Developer Dashboard

For **Reels publishing** with the current app: no additional permission beyond `instagram_business_content_publish` (already used in 5C).

For **official Music/Audio**: Facebook Login product + related review — **out of scope** until explicitly approved as a separate phase.
