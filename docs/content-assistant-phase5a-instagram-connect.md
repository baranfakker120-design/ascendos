# Content Assistant Phase 5A — Instagram Connection (OAuth only)

**Scope:** Connect an Instagram Professional account via official Meta OAuth.  
**Out of scope:** Publishing, auto-publish, `content_publish_attempts`, Graph publish calls, scraping, password login.

## Official Meta path

**Business Login for Instagram** (Instagram credentials; no Facebook Page required for connect).

Docs:

- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started/

### Supported account types

- Instagram **Professional** accounts: **Business** or **Creator**
- Personal accounts must convert to Professional first

### Phase 5A scope / permission

| Scope                                | Purpose                                            | Phase  |
| ------------------------------------ | -------------------------------------------------- | ------ |
| `instagram_business_basic`           | Profile identity (`user_id`, `username`) + connect | **5A** |
| `instagram_business_content_publish` | Publishing                                         | later  |
| `instagram_business_manage_comments` | Comments                                           | later  |
| `instagram_business_manage_messages` | Messaging                                          | later  |

### OAuth flow

1. User clicks **Instagram verbinden** on `/heute/content`
2. `POST /functions/v1/instagram-oauth` `{ action: "start" }` with user JWT
3. Edge signs CSRF `state`, sets DB status `pending_review`, returns Meta authorize URL
4. User authorizes on Instagram
5. Meta redirects to `META_REDIRECT_URI` with `code` + `state` (or `error`)
6. Edge verifies state, exchanges code → short-lived → long-lived token
7. Edge fetches `/me?fields=user_id,username`
8. Token stored **encrypted** in `content_instagram_connections.token_ref` (AES-GCM)
9. Browser redirected to `/heute/content?ig=connected` (**no tokens in URL/body**)

### Endpoints used

- `GET https://www.instagram.com/oauth/authorize`
- `POST https://api.instagram.com/oauth/access_token`
- `GET https://graph.instagram.com/access_token` (`ig_exchange_token`)
- `GET https://graph.instagram.com/v25.0/me?fields=user_id,username`

## Meta App Dashboard (manual — not automated)

1. Create Meta app → add **Instagram** product
2. Configure **Business Login for Instagram**
3. Add Valid OAuth Redirect URI = exact `META_REDIRECT_URI`
4. Copy Instagram App ID + App Secret into Edge secrets
5. For production users beyond app roles: App Review + any Business verification Meta requires
6. Do **not** request publish permissions until a later phase

## Edge secrets (server only)

| Secret                                                             | Required | Notes                                                                                       |
| ------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------- |
| `META_APP_ID`                                                      | yes      | Instagram App ID                                                                            |
| `META_APP_SECRET`                                                  | yes      | Instagram App Secret                                                                        |
| `META_REDIRECT_URI`                                                | yes      | Must match dashboard exactly, e.g. `https://<ref>.supabase.co/functions/v1/instagram-oauth` |
| `APP_ORIGIN`                                                       | yes      | Frontend origin for post-OAuth redirect, e.g. `https://app.example.com`                     |
| `META_TOKEN_ENCRYPTION_KEY`                                        | optional | AES key material; falls back to `META_APP_SECRET`                                           |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | yes      | existing                                                                                    |

Never commit secrets. Never send tokens to the client.

## Database

Uses existing `content_instagram_connections` (**no migration**).

| UI status    | DB `status`      |
| ------------ | ---------------- |
| disconnected | `disconnected`   |
| connecting   | `pending_review` |
| connected    | `connected`      |
| error        | `error`          |

Unique `(org_id, membership_id)`. RLS: own membership only. Client selects **never** include `token_ref` in app queries; Edge status responses omit it.

## Deploy notes

- Function: `instagram-oauth` with `--no-verify-jwt` (callback is unauthenticated GET; start/disconnect validate JWT in-code)
- **Do not** enable production OAuth or App Review until PR review
- Publishing remains disabled (`isInstagramPublishingEnabled() === false`)
