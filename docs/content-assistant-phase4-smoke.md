# AI Content Assistant — Phase 4 Daily Preparation Smoke

**Scope:** Daily Content Preparation only.  
**Not in this phase:** Production cron activation, Instagram OAuth, Graph publish, auto-publish, remote SQL / db push.

## Secrets (Edge only — never commit)

| Secret                      | Purpose                                                      |
| --------------------------- | ------------------------------------------------------------ |
| `CRON_SECRET`               | Gate for `content-daily-prepare` (`x-cron-secret` or Bearer) |
| `OPENROUTER_API_KEY`        | Vision generation (same as Phase 3)                          |
| `SUPABASE_SERVICE_ROLE_KEY` | Provided by Supabase runtime for the function                |

```bash
# Example (local/staging project; do not paste keys into git):
supabase secrets set CRON_SECRET="…"
# OPENROUTER_API_KEY already required for content-assistant
```

## Scheduler (documented — NOT activated in-repo)

- Call `POST /functions/v1/content-daily-prepare` every ~15 minutes in the UTC band that can cover Berlin noon under CET **and** CEST (e.g. 09:45–11:30 UTC).
- Header: `x-cron-secret: $CRON_SECRET`
- Body: `{ "locale": "de" }`
- Function enforces **Europe/Berlin hour == 12** with a 20-minute window. Idempotency via `UNIQUE (org_id, membership_id, prep_date)`.

Do **not** enable production cron without explicit Freigabe.

## Manual invoke (staging smoke)

Bypasses the noon guard only — still requires `CRON_SECRET`. Still never publishes.

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/content-daily-prepare" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"force":true,"membershipId":"<ACTIVE_MEMBERSHIP_UUID>","locale":"de"}'
```

Optional filters: `orgId`, `limit`.

### Expected success (`outcome: ready`)

- `content_daily_preparations`: `status=ready`, `prep_date` = Berlin calendar day, `asset_id` + `draft_id` set
- `content_drafts`: new row with **`status=draft`** (never auto-`ready`)
- Hook / Caption / Keywords / Hashtags / CTA / Clean Check present
- `content_publish_attempts`: **no new rows**
- Response includes `publishingEnabled: false`, `autoPublish: false`

### Expected skips

| `summary` / reason           | When                                                    |
| ---------------------------- | ------------------------------------------------------- |
| `outside_berlin_noon_window` | Cron without `force` outside 12:00–12:19 Berlin         |
| `no_assets`                  | Member has no personal/central candidates               |
| `no_suitable_asset`          | All candidates excluded (today/cooldown)                |
| `generation_quota_reached`   | `content_daily_generation_limit` exhausted (default 25) |
| `already_ready` / noop       | Slot already `ready` — **no second draft**              |

### Expected failure

- AI/OpenRouter error after 1 retry → prep `status=failed`, summary `ai_failed:…`
- Missing `CRON_SECRET` / `OPENROUTER_API_KEY` → HTTP 503, no partial publish

## UI check (`/heute/content`)

1. Open page as the smoked membership (Berlin `prep_date`).
2. **Ready:** Asset preview, format, hook/caption/hashtags, Clean Check, **Ansehen / Bearbeiten**.
3. Edit → Save → **Instagram vorbereiten** → draft `status=ready` only (still no publish).
4. **Skipped / Failed:** clear message; manual **Mit KI analysieren** still works.
5. Confirm browser TZ ≠ Berlin still shows the correct Berlin day prep.

## No-Publish guarantee

- Job never sets draft to `ready`
- Job never writes `content_publish_attempts`
- Job never calls Instagram Graph / OAuth
- Client “Instagram vorbereiten” only marks draft ready for a future Phase 6 flow

## Regression

Coach, Contacts, Team/Genealogy, AP, Profile, Chats, Sync, Today hub, Bottom Nav — untouched by this change set.
