// AscendOS Edge Function: run-monthly-awards (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: run-monthly-awards
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/run-monthly-awards/index.ts

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
// run-monthly-awards — Sprint 6 System 2
//
// Invoked by GitHub Actions on the 1st of each month (UTC) and
// manually via workflow_dispatch. Computes Berater des Monats for
// every organization (title month = current UTC month, AP from
// previous UTC month). Idempotent via compute_monthly_awards.
//
// Auth: Authorization: Bearer <MONTHLY_AWARDS_CRON_SECRET>
//       (must match Edge Function secret MONTHLY_AWARDS_CRON_SECRET)
// ============================================================


Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const cronSecret = Deno.env.get('MONTHLY_AWARDS_CRON_SECRET');
    if (!cronSecret) {
      console.error('run-monthly-awards: MONTHLY_AWARDS_CRON_SECRET not configured');
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

    let titlePeriod: string | null = null;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body?.title_period && typeof body.title_period === 'string') {
          titlePeriod = body.title_period.slice(0, 10);
        }
      } catch {
        // empty body is fine — defaults to current UTC month
      }
    }

    const { data, error } = await service.rpc('run_monthly_awards_job', {
      p_title_period: titlePeriod,
    });
    if (error) throw error;

    return json({ ok: true, result: data });
  } catch (e) {
    console.error('run-monthly-awards error', e instanceof Error ? e.message : e);
    return json({ error: 'Monthly awards job failed.' }, 500);
  }
});
