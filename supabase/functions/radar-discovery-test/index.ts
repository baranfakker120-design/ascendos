/**
 * radar-discovery-test — one-shot Meta Business Discovery probe for RADAR.
 *
 * Hard rules:
 * - Reads RADAR_META_ACCESS_TOKEN server-side only (never returns/logs it).
 * - Does NOT write team_radar_items or any DB tables.
 * - Does NOT download media / republish.
 * - Does NOT schedule Cron or enable polling.
 * - Does NOT touch Instagram Login / publish (instagram-oauth, instagram-publish).
 *
 * Auth: CRON_SECRET via x-cron-secret or Authorization Bearer (manual invoke only).
 */

import { handleOptions, json } from '../_shared/cors.ts';

/** Verified Ascendos Page → @bybarfum Instagram professional account (query identity). */
const RADAR_QUERY_IG_USER_ID = '17841436455645169';

/** Target professional accounts for Team Seyda Radar (Business Discovery usernames). */
const RADAR_TARGET_USERNAMES = ['chogangroupofficial', 'essencetribe.network'] as const;

const GRAPH_VERSION = 'v21.0';
const GRAPH_HOST = 'https://graph.facebook.com';

function authorizeCron(req: Request): Response | null {
  const expected = Deno.env.get('CRON_SECRET');
  if (!expected) {
    return json({ error: 'cron_secret_not_configured' }, 503);
  }
  const header =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  if (!header || header !== expected) {
    return json({ error: 'unauthorized' }, 401);
  }
  return null;
}

/** Strip tokens / bearer / long opaque strings from Meta error text before returning. */
function sanitizeMetaMessage(raw: unknown): string | null {
  if (raw == null) return null;
  let s = typeof raw === 'string' ? raw : String(raw);
  s = s.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  s = s.replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]');
  s = s.replace(/EAA[A-Za-z0-9]+/g, '[token_redacted]');
  s = s.replace(/IGQV[A-Za-z0-9]+/g, '[token_redacted]');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > 240 ? s.slice(0, 240) : s;
}

interface DiscoveryPageResult {
  username: string;
  ok: boolean;
  mediaItems: number;
  httpStatus: number;
  metaError?: {
    code?: number | string | null;
    type?: string | null;
    message?: string | null;
  };
}

async function discoverUsername(
  accessToken: string,
  username: string
): Promise<DiscoveryPageResult> {
  const fields = `business_discovery.username(${username}){username,media{id}}`;
  const url = new URL(`${GRAPH_HOST}/${GRAPH_VERSION}/${RADAR_QUERY_IG_USER_ID}`);
  url.searchParams.set('fields', fields);
  // Token only in outbound Meta request — never in logs or JSON responses.
  url.searchParams.set('access_token', accessToken);

  let res: Response;
  try {
    res = await fetch(url.toString(), { method: 'GET' });
  } catch {
    return {
      username,
      ok: false,
      mediaItems: 0,
      httpStatus: 0,
      metaError: { message: 'meta_network_error' },
    };
  }

  const httpStatus = res.status;
  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch {
    bodyText = '';
  }

  let parsed: {
    business_discovery?: { username?: string; media?: { data?: unknown[] } };
    error?: { message?: string; type?: string; code?: number };
  } = {};
  try {
    parsed = JSON.parse(bodyText) as typeof parsed;
  } catch {
    return {
      username,
      ok: false,
      mediaItems: 0,
      httpStatus,
      metaError: { message: 'meta_invalid_json' },
    };
  }

  if (!res.ok || parsed.error) {
    const err = parsed.error ?? {};
    return {
      username,
      ok: false,
      mediaItems: 0,
      httpStatus,
      metaError: {
        code: err.code ?? httpStatus,
        type: sanitizeMetaMessage(err.type),
        message: sanitizeMetaMessage(err.message) ?? 'meta_error',
      },
    };
  }

  const bd = parsed.business_discovery;
  const mediaItems = Array.isArray(bd?.media?.data) ? bd.media.data.length : 0;
  const verified = typeof bd?.username === 'string' && bd.username.length > 0;

  return {
    username,
    ok: verified,
    mediaItems,
    httpStatus,
  };
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const denied = authorizeCron(req);
  if (denied) return denied;

  const token = Deno.env.get('RADAR_META_ACCESS_TOKEN')?.trim() ?? '';
  if (!token) {
    return json(
      {
        success: false,
        source: 'meta_business_discovery',
        account_verified: false,
        items_found: 0,
        timestamp: new Date().toISOString(),
        error: 'radar_token_not_configured',
      },
      503
    );
  }

  try {
    const results: DiscoveryPageResult[] = [];
    for (const username of RADAR_TARGET_USERNAMES) {
      results.push(await discoverUsername(token, username));
    }

    const accountVerified = results.every((r) => r.ok);
    const itemsFound = results.reduce((sum, r) => sum + r.mediaItems, 0);
    const anyMetaError = results.find((r) => !r.ok);

    if (!accountVerified) {
      return json(
        {
          success: false,
          source: 'meta_business_discovery',
          account_verified: false,
          items_found: itemsFound,
          timestamp: new Date().toISOString(),
          error: 'business_discovery_failed',
          meta_http_status: anyMetaError?.httpStatus ?? null,
          meta_error_code: anyMetaError?.metaError?.code ?? null,
          meta_error_type: anyMetaError?.metaError?.type ?? null,
          meta_error_message: anyMetaError?.metaError?.message ?? null,
        },
        502
      );
    }

    return json({
      success: true,
      source: 'meta_business_discovery',
      account_verified: true,
      items_found: itemsFound,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal';
    const safe = sanitizeMetaMessage(msg) ?? 'internal';
    console.error('radar_discovery_test_fatal', safe);
    return json(
      {
        success: false,
        source: 'meta_business_discovery',
        account_verified: false,
        items_found: 0,
        timestamp: new Date().toISOString(),
        error: 'internal',
      },
      500
    );
  }
});
