// AscendOS Edge Function: run-live-coaching-maintenance (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: run-live-coaching-maintenance
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/run-live-coaching-maintenance/index.ts

import { createClient } from 'jsr:@supabase/supabase-js@2';

// ---- inline: _shared/cors.ts ----
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================================
// run-live-coaching-maintenance — Sprint 6 System 4
// Archives finished one-shots and rolls recurring starts_at.
// Auth: Bearer MONTHLY_AWARDS_CRON_SECRET (shared ops secret) or
//       LIVE_COACHING_CRON_SECRET if set.
// ============================================================


Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const cronSecret =
      Deno.env.get('LIVE_COACHING_CRON_SECRET') ?? Deno.env.get('MONTHLY_AWARDS_CRON_SECRET');
    if (!cronSecret) {
      return json({ error: 'Cron secret not configured' }, 503);
    }

    const auth = req.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token || token !== cronSecret) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data, error } = await service.rpc('run_live_coaching_maintenance_job');
    if (error) throw error;

    return json({ ok: true, result: data });
  } catch (e) {
    console.error('run-live-coaching-maintenance error', e instanceof Error ? e.message : e);
    return json({ error: 'Live coaching maintenance failed.' }, 500);
  }
});
