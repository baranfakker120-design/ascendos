/**
 * radar-discovery-test — RADAR Business Discovery → team_radar_items (manual invoke).
 *
 * Hard rules:
 * - Reads RADAR_META_ACCESS_TOKEN server-side only (never returns/logs it).
 * - Writes only to team_radar_items (Org #1), deduped by (org_id,user_id,source,external_id).
 * - Filters published_at >= per-user radar_started_at.
 * - Does NOT download media / republish.
 * - Does NOT schedule Cron or enable polling.
 * - Does NOT touch Instagram Login / publish (instagram-oauth, instagram-publish).
 *
 * Auth: CRON_SECRET via x-cron-secret or Authorization Bearer (manual invoke only).
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, json } from '../_shared/cors.ts';

const TEAM_SEYDA_ORG_ID = '00000000-0000-0000-0000-000000000001';

/** Verified Ascendos Page → @bybarfum Instagram professional account (query identity). */
const RADAR_QUERY_IG_USER_ID = '17841436455645169';

const GRAPH_VERSION = 'v21.0';
const GRAPH_HOST = 'https://graph.facebook.com';

type RadarSource = 'chogan' | 'essence_tribe';
type RadarContentType = 'POST' | 'REEL';

const TARGETS: ReadonlyArray<{ username: string; source: RadarSource }> = [
  { username: 'chogangroupofficial', source: 'chogan' },
  { username: 'essencetribe.network', source: 'essence_tribe' },
];

interface MetaMedia {
  id?: string;
  caption?: string;
  media_type?: string;
  permalink?: string;
  timestamp?: string;
}

interface NormalizedItem {
  source: RadarSource;
  external_id: string;
  content_type: RadarContentType;
  published_at: string;
  canonical_url: string;
  username: string;
}

interface TargetResult {
  username: string;
  success: boolean;
  items_found: number;
  new_items: number;
  duplicates: number;
  inserted: number;
  error?: string;
}

function authorizeCron(req: Request): Response | null {
  const cron = Deno.env.get('CRON_SECRET')?.trim() ?? '';
  const manual = Deno.env.get('RADAR_MANUAL_INVOKE_SECRET')?.trim() ?? '';
  if (!cron && !manual) {
    return json({ error: 'cron_secret_not_configured' }, 503);
  }
  const header =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  const ok = Boolean(header) && ((cron && header === cron) || (manual && header === manual));
  if (!ok) {
    return json({ error: 'unauthorized' }, 401);
  }
  return null;
}

function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('missing_supabase_admin_env');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

function mapContentType(mediaType: string | undefined, permalink: string | undefined): RadarContentType {
  const p = (permalink ?? '').toLowerCase();
  if (p.includes('/reel/')) return 'REEL';
  const t = (mediaType ?? '').toUpperCase();
  if (t === 'VIDEO') return 'REEL';
  return 'POST';
}

function normalizeMetaMedia(
  source: RadarSource,
  username: string,
  media: MetaMedia
): NormalizedItem | null {
  const externalId = typeof media.id === 'string' ? media.id.trim() : '';
  const permalink = typeof media.permalink === 'string' ? media.permalink.trim() : '';
  const timestamp = typeof media.timestamp === 'string' ? media.timestamp.trim() : '';
  if (!externalId || !permalink || !timestamp) return null;
  const published = new Date(timestamp);
  if (Number.isNaN(published.getTime())) return null;
  return {
    source,
    external_id: externalId,
    content_type: mapContentType(media.media_type, permalink),
    published_at: published.toISOString(),
    canonical_url: permalink,
    username,
  };
}

async function fetchDiscoveryMedia(
  accessToken: string,
  username: string
): Promise<{ ok: boolean; media: MetaMedia[]; httpStatus: number; error?: string }> {
  const fields = `business_discovery.username(${username}){username,media{id,caption,media_type,permalink,timestamp}}`;
  const url = new URL(`${GRAPH_HOST}/${GRAPH_VERSION}/${RADAR_QUERY_IG_USER_ID}`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('access_token', accessToken);

  let res: Response;
  try {
    res = await fetch(url.toString(), { method: 'GET' });
  } catch {
    return { ok: false, media: [], httpStatus: 0, error: 'meta_network_error' };
  }

  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch {
    bodyText = '';
  }

  let parsed: {
    business_discovery?: { username?: string; media?: { data?: MetaMedia[] } };
    error?: { message?: string; type?: string; code?: number };
  } = {};
  try {
    parsed = JSON.parse(bodyText) as typeof parsed;
  } catch {
    return { ok: false, media: [], httpStatus: res.status, error: 'meta_invalid_json' };
  }

  if (!res.ok || parsed.error) {
    return {
      ok: false,
      media: [],
      httpStatus: res.status,
      error: sanitizeMetaMessage(parsed.error?.message) ?? 'meta_error',
    };
  }

  const data = parsed.business_discovery?.media?.data;
  const media = Array.isArray(data) ? data : [];
  const verified = typeof parsed.business_discovery?.username === 'string';
  if (!verified) {
    return { ok: false, media: [], httpStatus: res.status, error: 'business_discovery_empty' };
  }
  return { ok: true, media, httpStatus: res.status };
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
        targets: TARGETS.length,
        items_found: 0,
        new_items: 0,
        duplicates: 0,
        inserted: 0,
        database_write: false,
        error: 'radar_token_not_configured',
      },
      503
    );
  }

  let db: SupabaseClient;
  try {
    db = adminClient();
  } catch {
    return json(
      {
        success: false,
        targets: TARGETS.length,
        items_found: 0,
        new_items: 0,
        duplicates: 0,
        inserted: 0,
        database_write: false,
        error: 'missing_supabase_admin_env',
      },
      503
    );
  }

  try {
    const { data: userStates, error: stateErr } = await db
      .from('team_radar_user_state')
      .select('user_id, radar_started_at, enabled, paused')
      .eq('org_id', TEAM_SEYDA_ORG_ID)
      .eq('enabled', true)
      .eq('paused', false);

    if (stateErr) {
      console.error('radar_user_state_query', sanitizeMetaMessage(stateErr.message));
      return json(
        {
          success: false,
          targets: TARGETS.length,
          items_found: 0,
          new_items: 0,
          duplicates: 0,
          inserted: 0,
          database_write: false,
          error: 'radar_user_state_query_failed',
        },
        500
      );
    }

    const activeUsers = (userStates ?? []) as Array<{
      user_id: string;
      radar_started_at: string;
    }>;

    const targetResults: TargetResult[] = [];
    let itemsFound = 0;
    let newItems = 0;
    let duplicates = 0;
    let inserted = 0;

    for (const target of TARGETS) {
      const discovered = await fetchDiscoveryMedia(token, target.username);
      if (!discovered.ok) {
        targetResults.push({
          username: target.username,
          success: false,
          items_found: 0,
          new_items: 0,
          duplicates: 0,
          inserted: 0,
          error: discovered.error ?? 'discovery_failed',
        });
        continue;
      }

      const normalized: NormalizedItem[] = [];
      for (const m of discovered.media) {
        const n = normalizeMetaMedia(target.source, target.username, m);
        if (n) normalized.push(n);
      }
      itemsFound += normalized.length;

      if (activeUsers.length === 0) {
        targetResults.push({
          username: target.username,
          success: true,
          items_found: normalized.length,
          new_items: 0,
          duplicates: 0,
          inserted: 0,
          error: 'no_active_radar_users',
        });
        continue;
      }

      let targetNew = 0;
      let targetDup = 0;
      let targetIns = 0;
      let targetFailed = false;
      let targetError: string | undefined;

      for (const user of activeUsers) {
        if (targetFailed) break;
        const startedAt = new Date(user.radar_started_at).getTime();
        const eligible = normalized.filter((n) => new Date(n.published_at).getTime() >= startedAt);
        if (eligible.length === 0) continue;

        const externalIds = eligible.map((e) => e.external_id);
        const { data: existingRows, error: existErr } = await db
          .from('team_radar_items')
          .select('external_id')
          .eq('org_id', TEAM_SEYDA_ORG_ID)
          .eq('user_id', user.user_id)
          .eq('source', target.source)
          .in('external_id', externalIds);

        if (existErr) {
          console.error('radar_items_dedupe_query', sanitizeMetaMessage(existErr.message));
          targetFailed = true;
          targetError = 'dedupe_query_failed';
          break;
        }

        const existing = new Set(
          (existingRows ?? []).map((r: { external_id: string }) => r.external_id)
        );
        const toInsert = eligible.filter((e) => !existing.has(e.external_id));
        const dupCount = eligible.length - toInsert.length;
        targetDup += dupCount;
        duplicates += dupCount;
        targetNew += toInsert.length;
        newItems += toInsert.length;

        if (toInsert.length === 0) continue;

        const rows = toInsert.map((e) => ({
          org_id: TEAM_SEYDA_ORG_ID,
          user_id: user.user_id,
          source: e.source,
          external_id: e.external_id,
          content_type: e.content_type,
          published_at: e.published_at,
          canonical_url: e.canonical_url,
        }));

        const { error: insertErr } = await db.from('team_radar_items').insert(rows);
        if (insertErr) {
          const msg = insertErr.message ?? '';
          if (/duplicate|unique/i.test(msg)) {
            targetDup += toInsert.length;
            duplicates += toInsert.length;
            targetNew -= toInsert.length;
            newItems -= toInsert.length;
          } else {
            console.error('radar_items_insert', sanitizeMetaMessage(msg));
            targetFailed = true;
            targetError = 'insert_failed';
            break;
          }
        } else {
          targetIns += toInsert.length;
          inserted += toInsert.length;
        }
      }

      targetResults.push({
        username: target.username,
        success: !targetFailed,
        items_found: normalized.length,
        new_items: Math.max(0, targetNew),
        duplicates: targetDup,
        inserted: targetIns,
        ...(targetError ? { error: targetError } : {}),
      });
    }

    const anySuccess = targetResults.some((t) => t.success);
    return json({
      success: anySuccess,
      targets: TARGETS.length,
      items_found: itemsFound,
      new_items: Math.max(0, newItems),
      duplicates,
      inserted,
      database_write: inserted > 0,
      active_radar_users: activeUsers.length,
      target_results: targetResults,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal';
    const safe = sanitizeMetaMessage(msg) ?? 'internal';
    console.error('radar_discovery_test_fatal', safe);
    return json(
      {
        success: false,
        targets: TARGETS.length,
        items_found: 0,
        new_items: 0,
        duplicates: 0,
        inserted: 0,
        database_write: false,
        error: 'internal',
      },
      500
    );
  }
});
