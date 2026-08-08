/**
 * Daily content preparation — target 12:00 (Europe/Berlin default).
 *
 * Phase 4: Edge Function `content-daily-prepare` implements selection +
 * shared generate core + upsert into `content_daily_preparations`.
 * Production cron is NOT activated in-repo — configure externally after Freigabe.
 */

export const DAILY_CONTENT_JOB = {
  localTime: '12:00',
  defaultTimezone: 'Europe/Berlin',
  noonWindowMinutes: 20,
  table: 'content_daily_preparations',
  edgeFunction: 'content-daily-prepare',
  /** Manual smoke may pass `{ force: true }` to bypass the Berlin noon guard. */
  manualForceFlag: 'force',
  draftStatusContract: 'draft',
} as const;

/**
 * Job contract (Edge Function `content-daily-prepare`):
 * 1. CRON_SECRET + service role (no user JWT batch).
 * 2. Berlin noon guard (or force for smoke).
 * 3. For each active membership: claim unique (org, membership, prep_date).
 * 4. If already ready → NO-OP.
 * 5. Quota check (`content_daily_generation_limit`) → skip without AI.
 * 6. Pick personal-first / low-usage asset (7-day cooldown).
 * 7. Shared generate core → draft status ALWAYS `draft`.
 * 8. Upsert preparation ready|skipped|failed.
 *
 * Compliance:
 * - No #fyp/#viral mass spam defaults
 * - No black-hat / shadowban circumvention claims
 * - No auto-publish / no content_publish_attempts / no Graph API
 */
export const DAILY_CONTENT_COMPLIANCE = {
  banSpamHashtagDefaults: true,
  requireCleanCheck: true,
  autoPublish: false,
  writesPublishAttempts: false,
} as const;

/**
 * Scheduler documentation (NOT activated here):
 *
 * Preferred: HTTP cron every 15 minutes between 09:45–11:30 UTC calling
 * `content-daily-prepare` with header `x-cron-secret: $CRON_SECRET`.
 * The function itself enforces Europe/Berlin hour==12 (20-minute window),
 * so CET (11:00 UTC) and CEST (10:00 UTC) are both covered without a
 * hard-coded single UTC clock time.
 *
 * Body example:
 * `{ "locale": "de" }`
 *
 * Manual smoke (bypass noon guard — staging only):
 * `{ "force": true, "membershipId": "<uuid>", "locale": "de" }`
 */
export const DAILY_CONTENT_SCHEDULER_NOTES = {
  activatedInRepo: false,
  authHeader: 'x-cron-secret',
  envSecrets: ['CRON_SECRET', 'OPENROUTER_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
} as const;
