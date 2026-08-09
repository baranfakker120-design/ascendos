// AscendOS Edge Function: instagram-audio-search (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: instagram-audio-search
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/instagram-audio-search/index.ts

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// ---- inline: _shared/cors.ts ----
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

// ---- inline: _shared/facebook-business-oauth/types.ts ----
/**
 * Facebook Login for Business — Phase B (music connection path).
 * Parallel to Instagram Login OAuth. No Audio search / audio_configuration here.
 */

/**
 * Scopes for Facebook Login for Business (Music path).
 * `instagram_content_publish` is required by Meta for Instagram Audio API search.
 */
export const FB_MUSIC_CONNECT_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
] as const;

export type FbConnectionDbStatus = 'disconnected' | 'pending_review' | 'connected' | 'error';
export type FbConnectionUiStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface FbOAuthStatePayload {
  mid: string;
  oid: string;
  nonce: string;
  exp: number;
  ruri?: string;
  /** Distinguishes from Instagram Login state blobs. */
  kind: 'fb_business';
}

/** Safe API view — never includes tokens. */
export interface SafeFacebookBusinessConnectionView {
  status: FbConnectionUiStatus;
  fbUserId: string | null;
  pageId: string | null;
  pageName: string | null;
  igUserId: string | null;
  igUsername: string | null;
  scopes: string[];
  connectedAt: string | null;
  lastError: string | null;
  oauthConfigured: boolean;
  /** True only when connection is valid for enabling Instagram Music capability. */
  instagramMusicAvailable: boolean;
}

export function dbStatusToUi(status: string | null | undefined): FbConnectionUiStatus {
  if (status === 'connected') return 'connected';
  if (status === 'error') return 'error';
  if (status === 'pending_review') return 'connecting';
  return 'disconnected';
}

export function isOAuthUserCancel(error: string | null | undefined): boolean {
  const e = (error ?? '').toLowerCase();
  return (
    e === 'access_denied' ||
    e.includes('user_denied') ||
    e.includes('user denied') ||
    e.includes('cancelled') ||
    e.includes('canceled')
  );
}

/** Required scopes for music connection validity (Page + IG identity). */
export function hasRequiredMusicScopes(scopes: string[] | null | undefined): boolean {
  const set = new Set((scopes ?? []).map((s) => s.trim()).filter(Boolean));
  return (
    set.has('instagram_basic') && set.has('pages_show_list') && set.has('pages_read_engagement')
  );
}

/**
 * Server/client-shared eligibility: music capability may be true only with a real
 * connected Facebook Login row that has Page + IG Professional IDs + required scopes.
 * Token presence is checked only server-side via `hasEncryptedPageToken`.
 */
export function resolveInstagramMusicAvailable(input: {
  status: string | null | undefined;
  pageId: string | null | undefined;
  igUserId: string | null | undefined;
  scopes: string[] | null | undefined;
  hasEncryptedPageToken: boolean;
}): boolean {
  if (input.status !== 'connected') return false;
  if (!input.pageId?.trim()) return false;
  if (!input.igUserId?.trim()) return false;
  if (!hasRequiredMusicScopes(input.scopes)) return false;
  if (!input.hasEncryptedPageToken) return false;
  return true;
}

// ---- inline: _shared/facebook-business-oauth/state.ts ----
/**
 * OAuth state HMAC for Facebook Business flow.
 * Separate payload shape (kind=fb_business) so it cannot be confused with Instagram Login state.
 */


const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function importAesKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', textEncoder.encode(secret));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** Encrypt access token → `v1.<iv>.<ciphertext>` (base64url). */
export async function encryptToken(plaintext: string, secret: string): Promise<string> {
  if (!plaintext) throw new Error('empty_token');
  if (!secret) throw new Error('missing_encryption_secret');
  const key = await importAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    textEncoder.encode(plaintext)
  );
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`;
}

export async function decryptToken(blob: string, secret: string): Promise<string> {
  if (!blob?.startsWith('v1.')) throw new Error('invalid_token_blob');
  if (!secret) throw new Error('missing_encryption_secret');
  const parts = blob.split('.');
  if (parts.length !== 3) throw new Error('invalid_token_blob');
  const iv = fromBase64Url(parts[1]!);
  const data = fromBase64Url(parts[2]!);
  const key = await importAesKey(secret);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return textDecoder.decode(plain);
}

export async function signFbOAuthState(
  payload: FbOAuthStatePayload,
  secret: string
): Promise<string> {
  const body = toBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifyFbOAuthState(
  state: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000)
): Promise<FbOAuthStatePayload | null> {
  if (!state || !secret) return null;
  const i = state.lastIndexOf('.');
  if (i <= 0) return null;
  const body = state.slice(0, i);
  const sigPart = state.slice(i + 1);
  const key = await importHmacKey(secret);
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    fromBase64Url(sigPart),
    textEncoder.encode(body)
  );
  if (!ok) return null;
  try {
    const payload = JSON.parse(textDecoder.decode(fromBase64Url(body))) as FbOAuthStatePayload;
    if (payload?.kind !== 'fb_business') return null;
    if (!payload?.mid || !payload?.oid || !payload?.nonce || !payload?.exp) return null;
    if (payload.exp < nowSec) return null;
    if (typeof payload.ruri === 'string') payload.ruri = payload.ruri.trim();
    else delete payload.ruri;
    return payload;
  } catch {
    return null;
  }
}

export function randomNonce(bytes = 16): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

// ---- inline: _shared/instagram-audio/types.ts ----
/**
 * Instagram Audio API — Phase C (search only).
 * Official Meta path: graph.facebook.com + Facebook Login User token.
 * No audio_configuration / publish here.
 */

export type InstagramAudioSearchType = 'music' | 'original_sound';

/** Permissions Meta lists for Instagram Audio API (Facebook Login). */
export const IG_AUDIO_SEARCH_SCOPES = ['instagram_basic', 'instagram_content_publish'] as const;

export interface InstagramAudioSearchItem {
  audio_id: string;
  audio_type: InstagramAudioSearchType;
  title: string | null;
  artist: string | null;
  duration_ms: number | null;
  cover_url: string | null;
  preview_url: string | null;
  ig_username: string | null;
}

export type InstagramAudioSearchErrorCode =
  | 'not_authenticated'
  | 'no_active_membership'
  | 'facebook_connection_missing'
  | 'facebook_connection_invalid'
  | 'missing_permission'
  | 'invalid_audio_type'
  | 'meta_api_error'
  | 'internal_error';

export function isInstagramAudioSearchType(value: unknown): value is InstagramAudioSearchType {
  return value === 'music' || value === 'original_sound';
}

export function hasAudioSearchScopes(scopes: string[] | null | undefined): boolean {
  const set = new Set((scopes ?? []).map((s) => s.trim()).filter(Boolean));
  return IG_AUDIO_SEARCH_SCOPES.every((s) => set.has(s));
}

export function missingAudioSearchScopes(scopes: string[] | null | undefined): string[] {
  const set = new Set((scopes ?? []).map((s) => s.trim()).filter(Boolean));
  return IG_AUDIO_SEARCH_SCOPES.filter((s) => !set.has(s));
}

// ---- inline: _shared/instagram-audio/search.ts ----
/** Official Meta Instagram Audio search helpers (Phase C). */


const GRAPH_HOST = 'https://graph.facebook.com';
const DEFAULT_GRAPH_VERSION = 'v25.0';

export function buildIgAudioSearchUrl(params: {
  audioType: InstagramAudioSearchType;
  igUserId: string;
  searchQuery?: string | null;
  accessToken: string;
  graphVersion?: string;
}): string {
  if (!isInstagramAudioSearchType(params.audioType)) {
    throw new Error('invalid_audio_type');
  }
  const igUserId = params.igUserId.trim();
  if (!igUserId) throw new Error('missing_ig_user_id');
  const accessToken = params.accessToken.trim();
  if (!accessToken) throw new Error('missing_access_token');

  const version = (params.graphVersion ?? DEFAULT_GRAPH_VERSION).replace(/^\/+|\/+$/g, '');
  const q = new URLSearchParams({
    audio_type: params.audioType,
    user_id: igUserId,
    access_token: accessToken,
  });
  const query = typeof params.searchQuery === 'string' ? params.searchQuery.trim() : '';
  if (query) q.set('search_query', query.slice(0, 100));
  return `${GRAPH_HOST}/${version}/ig_audio?${q.toString()}`;
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNullableInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function normalizeAudioType(
  raw: unknown,
  fallback: InstagramAudioSearchType
): InstagramAudioSearchType {
  if (raw === 'music' || raw === 'original_sound') return raw;
  if (typeof raw === 'string') {
    const lower = raw.toLowerCase();
    if (lower === 'music') return 'music';
    if (lower === 'original_sound' || lower === 'originalsound') return 'original_sound';
  }
  return fallback;
}

/** Map Meta `/ig_audio` payload → safe AscendOS search items (no tokens). */
export function parseIgAudioSearchResponse(
  json: unknown,
  fallbackType: InstagramAudioSearchType
): InstagramAudioSearchItem[] {
  if (!json || typeof json !== 'object') return [];
  const root = json as Record<string, unknown>;
  const rows = Array.isArray(root.audio) ? root.audio : [];
  const out: InstagramAudioSearchItem[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const audioId = asNullableString(rec.audio_id);
    if (!audioId) continue;
    const artist =
      asNullableString(rec.display_artist) ??
      asNullableString(rec.artist) ??
      asNullableString(rec.ig_username);
    out.push({
      audio_id: audioId,
      audio_type: normalizeAudioType(rec.audio_type, fallbackType),
      title: asNullableString(rec.title),
      artist,
      duration_ms: asNullableInt(rec.duration_in_ms),
      cover_url:
        asNullableString(rec.cover_artwork_thumbnail_uri) ??
        asNullableString(rec.cover_artwork_thumbnail_url),
      preview_url:
        asNullableString(rec.download_url) ??
        asNullableString(rec.on_platform_audio_preview_link),
      ig_username: asNullableString(rec.ig_username),
    });
  }
  return out;
}

export function sanitizeAudioMetaError(message: string, maxLen = 280): string {
  return message
    .replace(/EAA[A-Za-z0-9]+/g, '[redacted]')
    .replace(/IGAA[A-Za-z0-9]+/g, '[redacted]')
    .replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]')
    .slice(0, maxLen);
}

export function classifyMetaAudioSearchError(params: {
  httpStatus: number;
  body: unknown;
}): { code: 'missing_permission' | 'meta_api_error'; message: string } {
  const body = params.body && typeof params.body === 'object' ? (params.body as Record<string, unknown>) : {};
  const err = body.error && typeof body.error === 'object' ? (body.error as Record<string, unknown>) : null;
  const message = sanitizeAudioMetaError(
    String(err?.message ?? body.error ?? `meta_audio_search_${params.httpStatus}`)
  );
  const errType = String(err?.type ?? '').toLowerCase();
  const errCode = Number(err?.code ?? 0);
  const errSubcode = Number(err?.error_subcode ?? 0);
  const lower = message.toLowerCase();

  const permissionLike =
    params.httpStatus === 403 ||
    errCode === 10 ||
    errCode === 200 ||
    errSubcode === 458 ||
    (errType.includes('oauthexception') && lower.includes('permission')) ||
    lower.includes('permission') ||
    lower.includes('#10') ||
    lower.includes('(#200)');

  if (permissionLike) {
    return { code: 'missing_permission', message };
  }
  return { code: 'meta_api_error', message };
}

export async function searchInstagramAudio(params: {
  accessToken: string;
  igUserId: string;
  audioType: InstagramAudioSearchType;
  searchQuery?: string | null;
  fetchFn?: typeof fetch;
  graphVersion?: string;
}): Promise<{ audio: InstagramAudioSearchItem[] }> {
  const url = buildIgAudioSearchUrl(params);
  const fetchFn = params.fetchFn ?? fetch;
  const res = await fetchFn(url, { method: 'GET' });
  const json = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    const classified = classifyMetaAudioSearchError({ httpStatus: res.status, body: json });
    const err = new Error(classified.message) as Error & { code?: string };
    err.code = classified.code;
    throw err;
  }
  return { audio: parseIgAudioSearchResponse(json, params.audioType) };
}

/** Gate used by Edge before calling Meta. */
export function assertAudioSearchConnection(params: {
  status: string | null | undefined;
  igUserId: string | null | undefined;
  scopes: string[] | null | undefined;
  hasUserToken: boolean;
}):
  | { ok: true; igUserId: string }
  | { ok: false; error: 'facebook_connection_missing' | 'facebook_connection_invalid' | 'missing_permission'; missingScopes?: string[] } {
  if (!params.status || params.status === 'disconnected') {
    return { ok: false, error: 'facebook_connection_missing' };
  }
  if (params.status !== 'connected' || !params.igUserId?.trim() || !params.hasUserToken) {
    return { ok: false, error: 'facebook_connection_invalid' };
  }
  if (!hasAudioSearchScopes(params.scopes)) {
    return {
      ok: false,
      error: 'missing_permission',
      missingScopes: missingAudioSearchScopes(params.scopes),
    };
  }
  return { ok: true, igUserId: params.igUserId.trim() };
}

// ---- inline: _shared/instagram-audio/index.ts ----


/**
 * instagram-audio-search — Phase C Instagram Audio API search.
 *
 * Uses encrypted tokens from content_facebook_business_connections (Facebook Login).
 * Does NOT touch instagram-oauth, instagram-publish, or audio_configuration.
 *
 * POST { action: "search", audioType: "music"|"original_sound", searchQuery?: string }
 */


interface MembershipRow {
  id: string;
  org_id: string;
  role: string;
  status: string;
}

interface FbConnectionRow {
  status: string;
  ig_user_id: string | null;
  scopes: string[] | null;
  user_token_ref: string | null;
  page_token_ref: string | null;
}

function tokenSecret(): string {
  return (
    Deno.env.get('META_TOKEN_ENCRYPTION_KEY')?.trim() ||
    Deno.env.get('META_APP_SECRET')?.trim() ||
    ''
  );
}

function userClient(req: Request): SupabaseClient {
  const forwardHeaders: Record<string, string> = {
    Authorization: req.headers.get('Authorization') ?? '',
  };
  const orgSelector = req.headers.get('x-ascendos-org');
  if (orgSelector) forwardHeaders['x-ascendos-org'] = orgSelector;
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: forwardHeaders },
  });
}

function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function resolveMembership(
  db: SupabaseClient,
  req: Request
): Promise<{ membership: MembershipRow } | Response> {
  const { data: userData, error: authError } = await db.auth.getUser();
  if (authError || !userData.user) return json({ error: 'not_authenticated' }, 401);

  const { data: memberships, error: membershipError } = await db
    .from('memberships')
    .select('id, org_id, role, status')
    .eq('identity_id', userData.user.id)
    .eq('status', 'active');
  if (membershipError) throw membershipError;

  const orgHeader = req.headers.get('x-ascendos-org');
  const list = (memberships as MembershipRow[] | null) ?? [];
  const active =
    list.find((m) => orgHeader && m.org_id === orgHeader) ?? (list.length === 1 ? list[0] : null);
  if (!active) return json({ error: 'no_active_membership' }, 403);
  return { membership: active };
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const db = userClient(req);
    const resolved = await resolveMembership(db, req);
    if (resolved instanceof Response) return resolved;
    const { membership } = resolved;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'search');
    if (action !== 'search') {
      return json({ error: 'unsupported_action', action }, 400);
    }

    const audioTypeRaw = body.audioType ?? body.audio_type;
    if (!isInstagramAudioSearchType(audioTypeRaw)) {
      return json({ error: 'invalid_audio_type' }, 400);
    }

    const searchQuery =
      typeof body.searchQuery === 'string'
        ? body.searchQuery
        : typeof body.search_query === 'string'
          ? body.search_query
          : null;

    // Load FB connection via service role so token_ref columns are readable server-side only.
    const admin = adminClient();
    const { data: conn, error: connError } = await admin
      .from('content_facebook_business_connections')
      .select('status, ig_user_id, scopes, user_token_ref, page_token_ref')
      .eq('org_id', membership.org_id)
      .eq('membership_id', membership.id)
      .maybeSingle();
    if (connError) throw connError;

    const row = (conn as FbConnectionRow | null) ?? null;
    const gate = assertAudioSearchConnection({
      status: row?.status,
      igUserId: row?.ig_user_id,
      scopes: row?.scopes ?? [],
      hasUserToken: Boolean(row?.user_token_ref),
    });
    if (!gate.ok) {
      const status =
        gate.error === 'facebook_connection_missing'
          ? 409
          : gate.error === 'missing_permission'
            ? 403
            : 409;
      return json(
        {
          error: gate.error,
          missingScopes: gate.missingScopes ?? [],
          audioSearchAvailable: false,
        },
        status
      );
    }

    const secret = tokenSecret();
    if (!secret || !row?.user_token_ref) {
      return json({ error: 'facebook_connection_invalid', audioSearchAvailable: false }, 409);
    }

    let accessToken: string;
    try {
      accessToken = await decryptToken(row.user_token_ref, secret);
    } catch {
      return json({ error: 'facebook_connection_invalid', audioSearchAvailable: false }, 409);
    }

    try {
      const result = await searchInstagramAudio({
        accessToken,
        igUserId: gate.igUserId,
        audioType: audioTypeRaw,
        searchQuery,
      });
      // Never include tokens in the response.
      return json({
        ok: true,
        audioType: audioTypeRaw,
        searchQuery: typeof searchQuery === 'string' ? searchQuery.trim().slice(0, 100) : null,
        audio: result.audio,
        audioSearchAvailable: true,
      });
    } catch (e) {
      const err = e as Error & { code?: string };
      const code = err.code === 'missing_permission' ? 'missing_permission' : 'meta_api_error';
      const status = code === 'missing_permission' ? 403 : 502;
      return json(
        {
          error: code,
          message: sanitizeAudioMetaError(err.message || 'meta_api_error'),
          audioSearchAvailable: code !== 'missing_permission',
        },
        status
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'internal_error';
    return json({ error: 'internal_error', message: sanitizeAudioMetaError(message) }, 500);
  }
});
