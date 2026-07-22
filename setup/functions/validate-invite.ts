// AscendOS Edge Function: validate-invite (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: validate-invite
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/validate-invite/index.ts

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
// validate-invite [S-1]: Einziger Weg, Invite-Codes anonym zu
// prüfen. IP-Rate-Limit (10 Versuche / 10 Min), damit weder
// Codes noch Sponsor-/Team-Namen enumerierbar sind.
// ============================================================


const WINDOW_MINUTES = 10;
const MAX_ATTEMPTS = 10;

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();

    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    const { count } = await service
      .from('invite_validation_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', since);

    if ((count ?? 0) >= MAX_ATTEMPTS) {
      return json({ error: 'Zu viele Versuche. Bitte warte ein paar Minuten.' }, 429);
    }
    await service.from('invite_validation_attempts').insert({ ip });

    const body = await req.json();
    const code = String(body.code ?? '').trim();
    if (code.length < 6) return json({ valid: false });

    const { data, error } = await service.rpc('validate_invite', { invite_code: code });
    if (error) throw error;
    if (!data || data.length === 0) return json({ valid: false });

    return json({ valid: true, ...data[0] });
  } catch (e) {
    console.error('validate-invite error', e instanceof Error ? e.message : e);
    return json({ error: 'Prüfung fehlgeschlagen.' }, 500);
  }
});
