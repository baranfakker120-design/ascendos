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

import { handleOptions, json } from '../_shared/cors.ts';
import {
  timingSafeEqualString,
  verifyHubSignature256,
} from '../_shared/meta/hubSignature.ts';

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
