/**
 * RADAR Discovery scheduler contract (docs in code).
 * Production schedule is activated via migration
 * `20260914000058_radar_discovery_hourly_cron.sql` (pg_cron + pg_net).
 */

export const RADAR_DISCOVERY_JOB = {
  edgeFunction: 'radar-discovery-test',
  cronJobName: 'radar-discovery-hourly',
  schedule: '0 * * * *',
  frequency: 'hourly',
  polling: false,
  autoTokenRefresh: false,
  authHeader: 'x-cron-secret',
  vaultSecretNames: ['project_url', 'content_daily_prepare_cron_secret'] as const,
  edgeSecrets: [
    'CRON_SECRET',
    'RADAR_META_ACCESS_TOKEN',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ] as const,
  targets: ['chogangroupofficial', 'essencetribe.network'] as const,
  queryIdentity: 'bybarfum',
  tokenExpiryKnown: '2026-10-15',
} as const;
