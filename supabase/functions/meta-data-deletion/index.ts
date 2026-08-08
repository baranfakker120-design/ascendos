/**
 * meta-data-deletion — Meta / Instagram Data Deletion Request callback.
 *
 * Public endpoint (deploy with --no-verify-jwt). No AscendOS login.
 * Does not modify Instagram OAuth authorize/callback/start/disconnect flows.
 *
 * Routes:
 * - POST  application/x-www-form-urlencoded  signed_request=…  (Meta callback)
 * - GET   ?code=<confirmation_code>          (human-readable status page)
 * - OPTIONS                                  (CORS preflight)
 *
 * Meta docs:
 * https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, json } from '../_shared/cors.ts';
import {
  generateConfirmationCode,
  parseSignedRequest,
} from '../_shared/meta/signedRequest.ts';

interface ConnectionRow {
  id: string;
  org_id: string;
  membership_id: string;
}

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function functionBaseUrl(): string {
  const configured = Deno.env.get('SUPABASE_URL')?.trim().replace(/\/$/, '') ?? '';
  return `${configured}/functions/v1/meta-data-deletion`;
}

async function extractSignedRequest(req: Request): Promise<string | null> {
  const contentType = req.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await req.formData();
      const value = form.get('signed_request');
      return typeof value === 'string' && value ? value : null;
    }
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const value = form.get('signed_request');
      return typeof value === 'string' && value ? value : null;
    }
    if (contentType.includes('application/json')) {
      const body = (await req.json()) as { signed_request?: unknown };
      return typeof body?.signed_request === 'string' && body.signed_request
        ? body.signed_request
        : null;
    }
    // Fallback: try form body (Meta default).
    const form = await req.formData();
    const value = form.get('signed_request');
    return typeof value === 'string' && value ? value : null;
  } catch {
    return null;
  }
}

/**
 * Clear Meta/Instagram integration data for the given Meta user_id only.
 * Does not delete AscendOS profiles, memberships, contacts, or other users.
 */
async function clearInstagramIntegrationData(
  db: SupabaseClient,
  metaUserId: string
): Promise<{ connectionsCleared: number; publishAttemptsCleared: number }> {
  const { data: connections, error: selectError } = await db
    .from('content_instagram_connections')
    .select('id, org_id, membership_id')
    .eq('ig_user_id', metaUserId);
  if (selectError) throw selectError;

  const rows = (connections as ConnectionRow[] | null) ?? [];
  if (rows.length === 0) {
    return { connectionsCleared: 0, publishAttemptsCleared: 0 };
  }

  const connectionIds = rows.map((r) => r.id);

  const { data: deletedAttempts, error: deleteAttemptsError } = await db
    .from('content_publish_attempts')
    .delete()
    .in('connection_id', connectionIds)
    .select('id');
  if (deleteAttemptsError) throw deleteAttemptsError;

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await db
    .from('content_instagram_connections')
    .update({
      status: 'disconnected',
      token_ref: null,
      ig_user_id: null,
      ig_username: null,
      scopes: [],
      last_error: null,
      disconnected_at: now,
    })
    .eq('ig_user_id', metaUserId)
    .select('id');
  if (updateError) throw updateError;

  return {
    connectionsCleared: (updated ?? []).length,
    publishAttemptsCleared: (deletedAttempts ?? []).length,
  };
}

function appOrigin(): string {
  return (Deno.env.get('APP_ORIGIN') ?? Deno.env.get('PUBLIC_APP_ORIGIN') ?? '')
    .trim()
    .replace(/\/$/, '');
}

function statusText(opts: {
  confirmationCode: string;
  status: string;
  connectionsCleared: number;
  completedAt: string | null;
}): Response {
  const statusLabel =
    opts.status === 'completed'
      ? 'Abgeschlossen'
      : opts.status === 'not_found'
        ? 'Abgeschlossen (keine verknüpften Daten)'
        : opts.status === 'failed'
          ? 'Fehlgeschlagen'
          : 'Unbekannt';

  const detail =
    opts.status === 'completed'
      ? `Die zu dieser Anfrage gehörenden Instagram-Verbindungsdaten in AscendOS wurden entfernt bzw. invalidiert (${opts.connectionsCleared} Verbindung${opts.connectionsCleared === 1 ? '' : 'en'}).`
      : opts.status === 'not_found'
        ? 'Es wurden keine AscendOS-Instagram-Verbindungsdaten gefunden, die dieser Meta-Benutzer-ID eindeutig zugeordnet werden konnten. Es wurden keine anderen Benutzerdaten verändert.'
        : opts.status === 'failed'
          ? 'Die Löschanfrage konnte nicht vollständig verarbeitet werden. Bitte kontaktieren Sie den Verantwortlichen über die Datenschutzerklärung.'
          : 'Für diesen Bestätigungscode liegt keine bekannte Löschanfrage vor.';

  const privacyHref = appOrigin() ? `${appOrigin()}/datenschutz` : '';
  const lines = [
    'AscendOS — Status der Datenlöschung',
    'Meta / Instagram Data Deletion Request',
    '',
    `Bestätigungscode: ${opts.confirmationCode}`,
    `Status: ${statusLabel}`,
  ];
  if (opts.completedAt) lines.push(`Zeitpunkt: ${opts.completedAt}`);
  lines.push('', detail);
  if (privacyHref) {
    lines.push('', `Datenschutzerklärung: ${privacyHref}`);
  }

  return new Response(lines.join('\n') + '\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function notFoundStatusText(code: string): Response {
  return statusText({
    confirmationCode: code,
    status: 'unknown',
    connectionsCleared: 0,
    completedAt: null,
  });
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const code = (url.searchParams.get('code') ?? '').trim().toUpperCase();
      if (!code || !/^[A-Z0-9]{8,64}$/.test(code)) {
        return new Response(
          'AscendOS Meta Data Deletion endpoint. Use POST with signed_request (Meta callback) or GET ?code=<confirmation_code>.',
          { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        );
      }

      const db = adminClient();
      const { data, error } = await db
        .from('meta_data_deletion_requests')
        .select('confirmation_code, status, connections_cleared, completed_at')
        .eq('confirmation_code', code)
        .maybeSingle();
      if (error) throw error;
      if (!data) return notFoundStatusText(code);

      return statusText({
        confirmationCode: data.confirmation_code,
        status: data.status,
        connectionsCleared: data.connections_cleared ?? 0,
        completedAt: data.completed_at,
      });
    }

    if (req.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405);
    }

    const appSecret = Deno.env.get('META_APP_SECRET')?.trim() ?? '';
    if (!appSecret) {
      return json({ error: 'not_configured' }, 503);
    }

    const signedRequest = await extractSignedRequest(req);
    if (!signedRequest) {
      return json({ error: 'missing_signed_request' }, 400);
    }

    const payload = await parseSignedRequest(signedRequest, appSecret);
    if (!payload) {
      return json({ error: 'invalid_signed_request' }, 403);
    }

    const confirmationCode = generateConfirmationCode(20);
    const statusUrl = `${functionBaseUrl()}?code=${confirmationCode}`;
    const db = adminClient();
    const now = new Date().toISOString();

    let connectionsCleared = 0;
    let publishAttemptsCleared = 0;
    let status: 'completed' | 'not_found' | 'failed' = 'not_found';

    try {
      const cleared = await clearInstagramIntegrationData(db, payload.user_id);
      connectionsCleared = cleared.connectionsCleared;
      publishAttemptsCleared = cleared.publishAttemptsCleared;
      status = connectionsCleared > 0 ? 'completed' : 'not_found';
    } catch {
      status = 'failed';
    }

    const { error: insertError } = await db.from('meta_data_deletion_requests').insert({
      confirmation_code: confirmationCode,
      meta_user_id: payload.user_id,
      status,
      connections_cleared: connectionsCleared,
      publish_attempts_cleared: publishAttemptsCleared,
      completed_at: now,
    });
    if (insertError) throw insertError;

    // Meta expects exactly these keys.
    return json({
      url: statusUrl,
      confirmation_code: confirmationCode,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'internal_error';
    // Never leak secrets or signed payloads.
    return json({ error: 'internal_error', message: message.slice(0, 160) }, 500);
  }
});
