/**
 * content-daily-prepare — Phase 2 stub.
 *
 * Target schedule: 12:00 Europe/Berlin (configure via Supabase cron / external scheduler).
 * Does NOT publish to Instagram. Does NOT touch coach quota.
 *
 * TODO Phase 4+: implement selection + draft generation + clean check.
 * Register in scripts/bundle-functions.mjs when implementation is non-stub.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ascendos-org',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      status: 'not_implemented',
      job: 'content-daily-prepare',
      scheduleHint: '12:00 Europe/Berlin',
      message:
        'Foundation stub. Will prepare daily drafts from private content_assets without auto-publish.',
      todos: [
        'select_asset_for_member',
        'generate_draft_fields',
        'clean_check',
        'upsert_content_daily_preparations',
        'never_auto_publish',
        'never_use_coach_quota',
      ],
    }),
    {
      status: 501,
      headers: { ...cors, 'Content-Type': 'application/json' },
    }
  );
});
