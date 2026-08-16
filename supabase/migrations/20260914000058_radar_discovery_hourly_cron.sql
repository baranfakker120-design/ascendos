-- RADAR Discovery hourly cron (pg_cron + pg_net).
-- Reuses existing Vault secrets used by other AscendOS cron jobs:
--   project_url
--   content_daily_prepare_cron_secret  (= Edge CRON_SECRET; never stored in git)
-- Does NOT modify other cron jobs.
-- Does NOT store token values. Does NOT enable polling.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'radar-discovery-hourly') THEN
    PERFORM cron.unschedule('radar-discovery-hourly');
  END IF;
END
$$;

SELECT cron.schedule(
  'radar-discovery-hourly',
  '0 * * * *', -- once per hour at minute 0 (UTC)
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/radar-discovery-test',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'content_daily_prepare_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 100000
  ) as request_id;
  $cron$
);
