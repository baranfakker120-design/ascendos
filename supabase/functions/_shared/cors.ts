export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // x-ascendos-org: org selector from the shared Supabase client (additive; required for browser preflight).
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-ascendos-org',
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
