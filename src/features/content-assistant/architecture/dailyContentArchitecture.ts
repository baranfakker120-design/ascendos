/**
 * Daily content preparation — target 12:00 (Europe/Berlin default).
 *
 * Phase 2: schema + client read path only.
 * Job runner (Edge cron / scheduler) is intentionally not auto-deployed yet.
 */

export const DAILY_CONTENT_JOB = {
  localTime: '12:00',
  defaultTimezone: 'Europe/Berlin',
  table: 'content_daily_preparations',
  edgeFunction: 'content-daily-prepare',
} as const;

/**
 * Job contract (future Edge Function `content-daily-prepare`):
 * 1. For each active membership with content assets (or org batch).
 * 2. Pick a suitable unused/low-usage asset for the calendar day.
 * 3. Prepare draft fields (hook/caption/keywords/hashtags) without spam tags.
 * 4. Run clean check → status clean | attention.
 * 5. Upsert `content_daily_preparations` for prep_date.
 *
 * Compliance:
 * - No #fyp/#viral mass spam defaults
 * - No black-hat / shadowban circumvention claims
 * - No auto-publish
 */
export const DAILY_CONTENT_COMPLIANCE = {
  banSpamHashtagDefaults: true,
  requireCleanCheck: true,
  autoPublish: false,
} as const;
