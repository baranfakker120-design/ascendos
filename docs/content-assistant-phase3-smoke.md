# AI Content Assistant — Phase 3 Staging Smoke

**Secrets:** Set `OPENROUTER_API_KEY` only as a Supabase Edge Function secret. Never commit keys.

```bash
# Example (run locally against your project; do not paste keys into git):
supabase secrets set OPENROUTER_API_KEY="…"
supabase functions deploy content-assistant
```

## Checklist (manual)

1. Upload **image** asset → appears in library (quota decreases).
2. Upload **video** asset → appears in library.
3. Select asset → choose Story / Feed / Reel → **Analyze with AI**.
4. Confirm vision-derived draft: Hook, Caption, Keywords, Hashtags, CTA, Clean Check.
5. Confirm hashtag panel shows reasons (`Passend zum Thema` / curated / rejected spam) and **does not** claim live trends unless a live provider is enabled.
6. Save draft → reopen asset → draft still editable.
7. Edit caption/hashtags → Save → Clean Check refreshes.
8. **Prepare for Instagram** → draft `status=ready` (no publish, no OAuth).
9. Generation quota: hit `content_daily_generation_limit` → clear error (not coach quota).
10. Central asset (non-manager): generate succeeds; UI shows draft-only analysis note; asset metadata not falsely marked updated.
11. Unclear / low-context media → uncertain notes / sparse hashtags, no invented “viral” tags.
12. Problematic claims in generated/edited text → Clean Check `attention`.
13. Regression smoke: Coach chat, Contacts, Team, Profile, Today, Sync still work.

## Out of scope

- Daily cron (`content-daily-prepare`)
- Instagram OAuth / Graph publish
