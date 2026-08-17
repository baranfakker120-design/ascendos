/**
 * Instagram Content Autopilot V1 — architecture contract (docs in code).
 * No Facebook. External HTTP cron for content-autopilot-run (same pattern as daily-prepare).
 */

export const AUTOPILOT_JOB = {
  edgeUser: 'content-autopilot',
  edgeCron: 'content-autopilot-run',
  minEligibleAssets: 10,
  maxFeedPerDay: 3,
  maxStoriesPerDay: 10,
  defaultStoriesPerDay: 4,
  timezoneDefault: 'Europe/Berlin',
  tables: ['content_autopilot_settings', 'content_autopilot_plans', 'content_autopilot_slots'],
} as const;

export const AUTOPILOT_COMPLIANCE = {
  facebook: false,
  usesExistingInstagramConnection: true,
  usesExistingGraphPublishHelpers: true,
  browserTimersForbidden: true,
  dailyUserConfirmForbidden: true,
  standingConsentRequired: true,
} as const;

export const AUTOPILOT_SCHEDULER_NOTES = {
  activatedInRepo: false,
  authHeader: 'x-cron-secret',
  autoContinueNextPeriod: true,
  envSecrets: [
    'CRON_SECRET',
    'SUPABASE_SERVICE_ROLE_KEY',
    'META_TOKEN_ENCRYPTION_KEY',
    'META_APP_SECRET',
  ],
  curlExample:
    'curl -X POST "$SUPABASE_URL/functions/v1/content-autopilot-run" -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d "{}"',
} as const;
