// AscendOS Edge Function: instagram-webhook (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: instagram-webhook
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/instagram-webhook/index.ts

// ---- inline: _shared/cors.ts ----
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // x-ascendos-org: org selector from the shared Supabase client (additive; required for browser preflight).
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-ascendos-org, x-cron-secret',
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

// ---- inline: _shared/meta/hubSignature.ts ----
/**
 * Meta webhook `X-Hub-Signature-256` verification (HMAC-SHA256, hex).
 * Header form: `sha256=<hex>`
 * Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started/
 */

const textEncoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/**
 * Verify Meta `X-Hub-Signature-256` against the raw request body.
 * Returns false for missing/malformed header or mismatch.
 */
export async function verifyHubSignature256(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!appSecret || rawBody === undefined || rawBody === null) return false;
  if (!signatureHeader) return false;
  const match = /^sha256=([0-9a-fA-F]{64})$/.exec(signatureHeader.trim());
  if (!match) return false;
  const expected = match[1]!.toLowerCase();

  const key = await importHmacKey(appSecret);
  const mac = await crypto.subtle.sign('HMAC', key, textEncoder.encode(rawBody));
  const actual = toHex(new Uint8Array(mac));
  return timingSafeEqualHex(actual, expected);
}

/** Timing-safe equality for verify tokens (UTF-8 strings). */
export function timingSafeEqualString(a: string, b: string): boolean {
  const aa = textEncoder.encode(a);
  const bb = textEncoder.encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) {
    diff |= aa[i]! ^ bb[i]!;
  }
  return diff === 0;
}

/**
 * instagram-webhook — Meta / Instagram Webhooks callback (Phase 5A).
 *
 * Public endpoint (deploy with --no-verify-jwt). No AscendOS login.
 * Receive + verify only — no publishing, no automated side effects.
 *
 * Routes:
 * - GET  ?hub.mode=&hub.verify_token=&hub.challenge=  (Meta subscription verify)
 * - POST application/json + X-Hub-Signature-256       (event notifications)
 * - OPTIONS                                           (CORS preflight)
 *
 * Does not modify instagram-oauth or meta-data-deletion.
 *
 * Docs:
 * https://developers.facebook.com/docs/instagram-platform/webhooks/
 * https://developers.facebook.com/docs/graph-api/webhooks/getting-started/
 */


interface WebhookEntry {
  id?: string;
  time?: number;
  changes?: Array<{ field?: string; value?: unknown }>;
  messaging?: unknown[];
}

interface WebhookPayload {
  object?: string;
  entry?: WebhookEntry[];
}

function summarizePayload(payload: WebhookPayload): Record<string, unknown> {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const fields = new Set<string>();
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      if (typeof change.field === 'string' && change.field) fields.add(change.field);
    }
    if (Array.isArray(entry.messaging) && entry.messaging.length > 0) {
      fields.add('messaging');
    }
  }
  return {
    event: 'instagram_webhook',
    object: typeof payload.object === 'string' ? payload.object : null,
    entryCount: entries.length,
    entryIds: entries
      .map((e) => (typeof e.id === 'string' ? e.id : null))
      .filter((id): id is string => Boolean(id))
      .slice(0, 20),
    fields: [...fields].sort(),
    // Phase 5A: receive only — no publish / no side effects.
    action: 'accepted_no_side_effects',
  };
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode') ?? '';
      const token = url.searchParams.get('hub.verify_token') ?? '';
      const challenge = url.searchParams.get('hub.challenge') ?? '';

      const expected = Deno.env.get('WEBHOOK_VERIFY_TOKEN')?.trim() ?? '';
      if (!expected) {
        return json({ error: 'not_configured' }, 503);
      }

      if (mode === 'subscribe' && token && challenge && timingSafeEqualString(token, expected)) {
        // Meta requires the raw challenge string as the body (not JSON).
        return new Response(challenge, {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      return new Response('forbidden', { status: 403 });
    }

    if (req.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405);
    }

    const appSecret = Deno.env.get('META_APP_SECRET')?.trim() ?? '';
    if (!appSecret) {
      return json({ error: 'not_configured' }, 503);
    }

    const rawBody = await req.text();
    const signatureHeader =
      req.headers.get('X-Hub-Signature-256') ?? req.headers.get('x-hub-signature-256');

    // When Meta sends (or omits) the signature header: require a valid HMAC.
    const signatureOk = await verifyHubSignature256(rawBody, signatureHeader, appSecret);
    if (!signatureOk) {
      return new Response('forbidden', { status: 403 });
    }

    let payload: WebhookPayload;
    try {
      payload = JSON.parse(rawBody) as WebhookPayload;
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return json({ error: 'invalid_payload' }, 400);
    }

    // Structured log only — never log secrets, tokens, or full message bodies.
    console.log(JSON.stringify(summarizePayload(payload)));

    // Acknowledge quickly; Phase 5A performs no publish / no DB writes.
    return json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'internal_error';
    return json({ error: 'internal_error', message: message.slice(0, 160) }, 500);
  }
});
