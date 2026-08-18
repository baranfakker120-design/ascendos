// AscendOS Edge Function: radar-discovery-test (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: radar-discovery-test
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/radar-discovery-test/index.ts

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

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

// ---- inline: _shared/radar/insertGate.ts ----
/**
 * Pure RADAR insert gates for Edge Discovery (Deno).
 * Keep in sync with src/features/team-seyda-radar/radarInsertGate.ts
 */

export const TEAM_SEYDA_ORG_ID = '00000000-0000-0000-0000-000000000001';

export type RadarSource = 'chogan' | 'essence_tribe' | 'chogan_beauty';
export type RadarContentType = 'POST' | 'REEL';

export interface RadarNormalizedItem {
  source: RadarSource;
  external_id: string;
  content_type: RadarContentType;
  published_at: string;
  canonical_url: string;
}

/** Server-side startpoint: published_at >= radar_started_at (inclusive). */
export function isOnOrAfterRadarStartpoint(
  publishedAtIso: string,
  radarStartedAtIso: string
): boolean {
  const publishedMs = Date.parse(publishedAtIso);
  const startedMs = Date.parse(radarStartedAtIso);
  if (!Number.isFinite(publishedMs) || !Number.isFinite(startedMs)) return false;
  return publishedMs >= startedMs;
}

export function filterItemsByRadarStartpoint<T extends { published_at: string }>(
  items: readonly T[],
  radarStartedAtIso: string
): T[] {
  return items.filter((item) => isOnOrAfterRadarStartpoint(item.published_at, radarStartedAtIso));
}

export function partitionNewVsDuplicate<T extends { external_id: string }>(
  candidates: readonly T[],
  existingExternalIds: ReadonlySet<string>
): { fresh: T[]; duplicates: T[] } {
  const fresh: T[] = [];
  const duplicates: T[] = [];
  for (const item of candidates) {
    if (existingExternalIds.has(item.external_id)) duplicates.push(item);
    else fresh.push(item);
  }
  return { fresh, duplicates };
}

/**
 * Discovery writes are Org #1 only. Client/body org ids are ignored unless forged.
 */
export function resolveRadarWriteOrgId(clientOrgId: unknown): string | null {
  if (clientOrgId == null || clientOrgId === '') return TEAM_SEYDA_ORG_ID;
  if (typeof clientOrgId !== 'string') return null;
  if (clientOrgId === TEAM_SEYDA_ORG_ID) return TEAM_SEYDA_ORG_ID;
  return null;
}

export function mapUsernameToSource(username: string): RadarSource | null {
  if (username === 'chogangroupofficial') return 'chogan';
  if (username === 'essencetribe.network') return 'essence_tribe';
  if (username === 'choganbeautyofficial') return 'chogan_beauty';
  return null;
}

/** Canonical Business Discovery targets — same list the hourly edge function iterates. */
export const RADAR_DISCOVERY_TARGETS: ReadonlyArray<{ username: string; source: RadarSource }> = [
  { username: 'chogangroupofficial', source: 'chogan' },
  { username: 'essencetribe.network', source: 'essence_tribe' },
  { username: 'choganbeautyofficial', source: 'chogan_beauty' },
];

export function mapMediaToContentType(
  mediaType: string | undefined,
  permalink: string | undefined
): RadarContentType {
  const p = (permalink ?? '').toLowerCase();
  if (p.includes('/reel/')) return 'REEL';
  if ((mediaType ?? '').toUpperCase() === 'VIDEO') return 'REEL';
  return 'POST';
}

// ---- inline: _shared/radar/metaFetchPolicy.ts ----
/**
 * Meta HTTP error classification + retry policy for RADAR Discovery.
 * Keep in sync with src/features/team-seyda-radar/radarMetaFetchPolicy.ts
 *
 * No auto token refresh. Cron must not tight-loop on auth failures.
 */

export type MetaErrorKind =
  | 'ok'
  | 'meta_auth_error'
  | 'meta_forbidden'
  | 'meta_rate_limited'
  | 'meta_server_error'
  | 'meta_timeout'
  | 'meta_network_error'
  | 'meta_client_error'
  | 'meta_invalid_json'
  | 'business_discovery_empty'
  | 'unknown';

export type MetaRetryDecision = 'do_not_retry' | 'retry_with_backoff' | 'defer_to_next_hour';

/** Max additional attempts after the first try within a single target fetch. */
export const META_MAX_RETRIES = 2;

/** Base backoff for 5xx / timeout retries (ms). Jitter applied by caller. */
export const META_RETRY_BASE_MS = 400;

/** Single limited backoff for 429 before deferring to next hourly cron. */
export const META_RATE_LIMIT_BACKOFF_MS = 1200;

export function classifyMetaHttpStatus(httpStatus: number): MetaErrorKind {
  if (httpStatus === 0) return 'meta_network_error';
  if (httpStatus === 401) return 'meta_auth_error';
  if (httpStatus === 403) return 'meta_forbidden';
  if (httpStatus === 429) return 'meta_rate_limited';
  if (httpStatus >= 500 && httpStatus <= 599) return 'meta_server_error';
  if (httpStatus >= 400 && httpStatus <= 499) return 'meta_client_error';
  if (httpStatus >= 200 && httpStatus < 300) return 'ok';
  return 'unknown';
}

/**
 * Decide retry behavior for a Meta failure.
 * attemptIndex: 0 = first failure after initial request.
 */
export function decideMetaRetry(
  kind: MetaErrorKind,
  attemptIndex: number
): MetaRetryDecision {
  if (kind === 'meta_auth_error' || kind === 'meta_forbidden' || kind === 'meta_client_error') {
    return 'do_not_retry';
  }
  if (kind === 'meta_rate_limited') {
    // One limited backoff at most, then wait for next hourly cron.
    return attemptIndex === 0 ? 'retry_with_backoff' : 'defer_to_next_hour';
  }
  if (
    kind === 'meta_server_error' ||
    kind === 'meta_timeout' ||
    kind === 'meta_network_error'
  ) {
    return attemptIndex < META_MAX_RETRIES ? 'retry_with_backoff' : 'defer_to_next_hour';
  }
  return 'do_not_retry';
}

/** Deterministic backoff ms (tests); production adds jitter via `withJitter`. */
export function metaBackoffMs(kind: MetaErrorKind, attemptIndex: number): number {
  if (kind === 'meta_rate_limited') return META_RATE_LIMIT_BACKOFF_MS;
  return META_RETRY_BASE_MS * 2 ** Math.max(0, attemptIndex);
}

export function withJitter(baseMs: number, random01: number = Math.random()): number {
  const r = Math.min(1, Math.max(0, random01));
  // ±25% jitter
  return Math.round(baseMs * (0.75 + r * 0.5));
}

export function errorKindFromFetchFailure(opts: {
  httpStatus: number;
  timedOut?: boolean;
  networkError?: boolean;
  invalidJson?: boolean;
  emptyDiscovery?: boolean;
}): MetaErrorKind {
  if (opts.timedOut) return 'meta_timeout';
  if (opts.networkError) return 'meta_network_error';
  if (opts.invalidJson) return 'meta_invalid_json';
  if (opts.emptyDiscovery) return 'business_discovery_empty';
  return classifyMetaHttpStatus(opts.httpStatus);
}

/** Dead token: skip later targets. Per-target 403/empty/5xx must not abort the others. */
export function shouldSkipRemainingRadarTargets(kind: MetaErrorKind): boolean {
  return kind === 'meta_auth_error';
}

/**
 * After a named target fails, which usernames were already attempted vs skipped.
 * Production TARGETS keep existing accounts first so a beauty-only failure cannot
 * skip chogangroupofficial / essencetribe.network.
 */
export function radarTargetsAfterFailure(
  allUsernames: readonly string[],
  failedUsername: string,
  failKind: MetaErrorKind
): { attempted: string[]; skipped: string[] } {
  const idx = allUsernames.indexOf(failedUsername);
  if (idx < 0) return { attempted: [], skipped: [...allUsernames] };
  const attempted = allUsernames.slice(0, idx + 1);
  const rest = allUsernames.slice(idx + 1);
  if (shouldSkipRemainingRadarTargets(failKind)) {
    return { attempted: [...attempted], skipped: [...rest] };
  }
  return { attempted: [...allUsernames], skipped: [] };
}

// ---- inline: _shared/radar/index.ts ----


/**
 * radar-discovery-test — RADAR Business Discovery → team_radar_items.
 *
 * Hard rules:
 * - Reads RADAR_META_ACCESS_TOKEN server-side only (never returns/logs it).
 * - Writes only to team_radar_items (Org #1), deduped by (org_id,user_id,source,external_id).
 * - Filters published_at >= per-user radar_started_at.
 * - Does NOT download media / republish.
 * - Does NOT enable continuous polling.
 * - Does NOT auto-refresh Meta tokens.
 * - Does NOT touch Instagram Login / publish (instagram-oauth, instagram-publish).
 *
 * Schedule: hourly via pg_cron + pg_net (job `radar-discovery-hourly`).
 * Auth: CRON_SECRET via x-cron-secret or Authorization Bearer.
 */


/** Verified Ascendos Page → @bybarfum Instagram professional account (query identity). */
const RADAR_QUERY_IG_USER_ID = '17841436455645169';

const GRAPH_VERSION = 'v21.0';
const GRAPH_HOST = 'https://graph.facebook.com';
const META_FETCH_TIMEOUT_MS = 25_000;

const TARGETS = RADAR_DISCOVERY_TARGETS;

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
  error_kind?: MetaErrorKind;
  attempts?: number;
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
  return mapMediaToContentType(mediaType, permalink);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDiscoveryMediaOnce(
  accessToken: string,
  username: string
): Promise<{
  ok: boolean;
  media: MetaMedia[];
  httpStatus: number;
  error?: string;
  kind: MetaErrorKind;
}> {
  const fields = `business_discovery.username(${username}){username,media{id,caption,media_type,permalink,timestamp}}`;
  const url = new URL(`${GRAPH_HOST}/${GRAPH_VERSION}/${RADAR_QUERY_IG_USER_ID}`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('access_token', accessToken);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), META_FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), { method: 'GET', signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    const aborted =
      (e instanceof DOMException && e.name === 'AbortError') ||
      (e instanceof Error && e.name === 'AbortError');
    const kind = errorKindFromFetchFailure({
      httpStatus: 0,
      timedOut: aborted,
      networkError: !aborted,
    });
    return {
      ok: false,
      media: [],
      httpStatus: 0,
      error: kind,
      kind,
    };
  } finally {
    clearTimeout(timer);
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
    const kind = errorKindFromFetchFailure({ httpStatus: res.status, invalidJson: true });
    return { ok: false, media: [], httpStatus: res.status, error: kind, kind };
  }

  if (!res.ok || parsed.error) {
    const kind = classifyFromMetaResponse(res.status, parsed.error?.code);
    return {
      ok: false,
      media: [],
      httpStatus: res.status,
      error: sanitizeMetaMessage(parsed.error?.message) ?? kind,
      kind,
    };
  }

  const data = parsed.business_discovery?.media?.data;
  const media = Array.isArray(data) ? data : [];
  const verified = typeof parsed.business_discovery?.username === 'string';
  if (!verified) {
    const kind = errorKindFromFetchFailure({ httpStatus: res.status, emptyDiscovery: true });
    return { ok: false, media: [], httpStatus: res.status, error: kind, kind };
  }
  return { ok: true, media, httpStatus: res.status, kind: 'ok' };
}

/** Prefer HTTP status; Meta OAuthException codes sometimes arrive with 400. */
function classifyFromMetaResponse(httpStatus: number, metaCode: number | undefined): MetaErrorKind {
  if (httpStatus === 401 || metaCode === 190) return 'meta_auth_error';
  if (httpStatus === 403 || metaCode === 10 || metaCode === 200) return 'meta_forbidden';
  if (httpStatus === 429 || metaCode === 4 || metaCode === 17 || metaCode === 32) {
    return 'meta_rate_limited';
  }
  return errorKindFromFetchFailure({ httpStatus });
}

async function fetchDiscoveryMedia(
  accessToken: string,
  username: string
): Promise<{
  ok: boolean;
  media: MetaMedia[];
  httpStatus: number;
  error?: string;
  kind: MetaErrorKind;
  attempts: number;
}> {
  let attempt = 0;
  let last = await fetchDiscoveryMediaOnce(accessToken, username);
  if (last.ok) return { ...last, attempts: 1 };

  // attemptIndex 0 = first failure; allow limited retries per policy.
  while (true) {
    const decision = decideMetaRetry(last.kind, attempt);
    if (decision !== 'retry_with_backoff') {
      return { ...last, attempts: attempt + 1 };
    }
    const wait = withJitter(metaBackoffMs(last.kind, attempt));
    await sleep(wait);
    attempt += 1;
    last = await fetchDiscoveryMediaOnce(accessToken, username);
    if (last.ok) return { ...last, attempts: attempt + 1 };
  }
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const denied = authorizeCron(req);
  if (denied) return denied;

  // Optional body.org_id is hard-gated to Org #1; forged orgs are rejected.
  let clientOrgId: unknown = null;
  if (req.method === 'POST') {
    try {
      const body = (await req.json()) as { organization_id?: unknown; org_id?: unknown };
      clientOrgId = body.organization_id ?? body.org_id ?? null;
    } catch {
      clientOrgId = null;
    }
  }
  const writeOrgId = resolveRadarWriteOrgId(clientOrgId);
  if (!writeOrgId) {
    return json(
      {
        success: false,
        targets: TARGETS.length,
        items_found: 0,
        new_items: 0,
        duplicates: 0,
        inserted: 0,
        database_write: false,
        error: 'organisation_mismatch',
      },
      403
    );
  }

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
      .eq('org_id', writeOrgId)
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
    let authHardFail = false;

    for (const target of TARGETS) {
      // One target may fail without abandoning the other (unless token is dead).
      if (authHardFail) {
        targetResults.push({
          username: target.username,
          success: false,
          items_found: 0,
          new_items: 0,
          duplicates: 0,
          inserted: 0,
          error: 'meta_auth_error',
          error_kind: 'meta_auth_error',
          attempts: 0,
        });
        continue;
      }

      const discovered = await fetchDiscoveryMedia(token, target.username);
      if (!discovered.ok) {
        if (shouldSkipRemainingRadarTargets(discovered.kind)) authHardFail = true;
        console.error(
          'radar_discovery_target_fail',
          JSON.stringify({
            username: target.username,
            kind: discovered.kind,
            httpStatus: discovered.httpStatus,
            attempts: discovered.attempts,
          })
        );
        targetResults.push({
          username: target.username,
          success: false,
          items_found: 0,
          new_items: 0,
          duplicates: 0,
          inserted: 0,
          error: discovered.error ?? discovered.kind,
          error_kind: discovered.kind,
          attempts: discovered.attempts,
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
          attempts: discovered.attempts,
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
        // Server-side startpoint: published_at >= radar_started_at (not FE-only).
        const eligible = filterItemsByRadarStartpoint(normalized, user.radar_started_at);
        if (eligible.length === 0) continue;

        const externalIds = eligible.map((e) => e.external_id);
        const { data: existingRows, error: existErr } = await db
          .from('team_radar_items')
          .select('external_id')
          .eq('org_id', writeOrgId)
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
        const { fresh: toInsert, duplicates: dups } = partitionNewVsDuplicate(eligible, existing);
        const dupCount = dups.length;
        targetDup += dupCount;
        duplicates += dupCount;
        targetNew += toInsert.length;
        newItems += toInsert.length;

        if (toInsert.length === 0) continue;

        const rows = toInsert.map((e) => ({
          org_id: writeOrgId,
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
        attempts: discovered.attempts,
        ...(targetError ? { error: targetError } : {}),
      });
    }

    const anySuccess = targetResults.some((t) => t.success);
    const summary = {
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
      ...(authHardFail ? { error: 'meta_auth_error' } : {}),
    };

    // Safe stats only — never log tokens or Meta payloads.
    console.log(
      'radar_discovery_run',
      JSON.stringify({
        targets: summary.targets,
        items_found: summary.items_found,
        new_items: summary.new_items,
        duplicates: summary.duplicates,
        inserted: summary.inserted,
        success: summary.success,
        auth_hard_fail: authHardFail,
      })
    );

    return json(summary);
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
