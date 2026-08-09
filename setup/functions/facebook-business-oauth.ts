// AscendOS Edge Function: facebook-business-oauth (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: facebook-business-oauth
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/facebook-business-oauth/index.ts

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

// ---- inline: _shared/facebook-business-oauth/meta.ts ----
/** Official Facebook Login for Business HTTP helpers (Phase B — connect only). */


const GRAPH = 'https://graph.facebook.com';
const GRAPH_VERSION = 'v25.0';
const DIALOG_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

/**
 * Normalize redirect URI for authorize + token exchange.
 * Preserve trailing slash — Meta compares character-for-character.
 */
export function normalizeRedirectUri(raw: string): string {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

export function normalizeOAuthCode(raw: string): string {
  return raw.trim().split('#')[0]!.trim();
}

export function describeRedirectUri(uri: string): {
  redirectUri: string;
  length: number;
  endsWithSlash: boolean;
  hasQuery: boolean;
  hasSpace: boolean;
  scheme: 'https' | 'http' | 'other';
} {
  const redirectUri = normalizeRedirectUri(uri);
  let scheme: 'https' | 'http' | 'other' = 'other';
  if (redirectUri.startsWith('https://')) scheme = 'https';
  else if (redirectUri.startsWith('http://')) scheme = 'http';
  return {
    redirectUri,
    length: redirectUri.length,
    endsWithSlash: redirectUri.endsWith('/'),
    hasQuery: redirectUri.includes('?'),
    hasSpace: /\s/.test(redirectUri),
    scheme,
  };
}

/** Facebook Login for Business authorize URL (response_type=code — tokens stay server-side). */
export function buildFacebookBusinessAuthorizeUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
}): string {
  const scope = (params.scopes ?? FB_MUSIC_CONNECT_SCOPES).join(',');
  const redirectUri = normalizeRedirectUri(params.redirectUri);
  const q = new URLSearchParams({
    client_id: params.appId,
    redirect_uri: redirectUri,
    state: params.state,
    response_type: 'code',
    scope,
    display: 'page',
    // Official IG API onboarding channel for Facebook Login for Business.
    extras: JSON.stringify({ setup: { channel: 'IG_API_ONBOARDING' } }),
  });
  return `${DIALOG_URL}?${q.toString()}`;
}

export async function exchangeCodeForUserToken(params: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
  fetchFn?: typeof fetch;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const fetchFn = params.fetchFn ?? fetch;
  const redirectUri = normalizeRedirectUri(params.redirectUri);
  const code = normalizeOAuthCode(params.code);
  const q = new URLSearchParams({
    client_id: params.appId,
    client_secret: params.appSecret,
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetchFn(`${GRAPH}/${GRAPH_VERSION}/oauth/access_token?${q.toString()}`);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errObj = json.error as { message?: string } | undefined;
    throw new Error(String(errObj?.message ?? json.error ?? `fb_token_exchange_${res.status}`));
  }
  const accessToken = String(json.access_token ?? '');
  if (!accessToken) throw new Error('fb_token_exchange_missing_access_token');
  return {
    accessToken,
    expiresIn: Number(json.expires_in ?? 0) || 0,
  };
}

export async function exchangeForLongLivedUserToken(params: {
  appId: string;
  appSecret: string;
  shortLivedToken: string;
  fetchFn?: typeof fetch;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const fetchFn = params.fetchFn ?? fetch;
  const q = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: params.appId,
    client_secret: params.appSecret,
    fb_exchange_token: params.shortLivedToken,
  });
  const res = await fetchFn(`${GRAPH}/${GRAPH_VERSION}/oauth/access_token?${q.toString()}`);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errObj = json.error as { message?: string } | undefined;
    throw new Error(String(errObj?.message ?? json.error ?? `fb_long_lived_${res.status}`));
  }
  const accessToken = String(json.access_token ?? '');
  if (!accessToken) throw new Error('fb_long_lived_missing_access_token');
  return {
    accessToken,
    expiresIn: Number(json.expires_in ?? 0) || 0,
  };
}

export async function fetchFacebookUserId(params: {
  accessToken: string;
  fetchFn?: typeof fetch;
}): Promise<string> {
  const fetchFn = params.fetchFn ?? fetch;
  const q = new URLSearchParams({
    fields: 'id',
    access_token: params.accessToken,
  });
  const res = await fetchFn(`${GRAPH}/${GRAPH_VERSION}/me?${q.toString()}`);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errObj = json.error as { message?: string } | undefined;
    throw new Error(String(errObj?.message ?? json.error ?? `fb_me_${res.status}`));
  }
  const id = String(json.id ?? '');
  if (!id) throw new Error('fb_me_missing_id');
  return id;
}

export interface FacebookPageWithIg {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  igUserId: string;
}

/**
 * List Pages the user can manage and resolve linked Instagram Business/Creator accounts.
 * Requires pages_show_list (+ page token for later Graph IG calls).
 */
export async function fetchPagesWithInstagramBusiness(params: {
  userAccessToken: string;
  fetchFn?: typeof fetch;
}): Promise<FacebookPageWithIg[]> {
  const fetchFn = params.fetchFn ?? fetch;
  const q = new URLSearchParams({
    fields: 'id,name,access_token,instagram_business_account',
    access_token: params.userAccessToken,
  });
  const res = await fetchFn(`${GRAPH}/${GRAPH_VERSION}/me/accounts?${q.toString()}`);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errObj = json.error as { message?: string } | undefined;
    throw new Error(String(errObj?.message ?? json.error ?? `fb_accounts_${res.status}`));
  }
  const data = Array.isArray(json.data) ? json.data : [];
  const out: FacebookPageWithIg[] = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const pageId = String(rec.id ?? '');
    const pageName = String(rec.name ?? '');
    const pageAccessToken = String(rec.access_token ?? '');
    const igRaw = rec.instagram_business_account;
    const igObj =
      igRaw && typeof igRaw === 'object' ? (igRaw as Record<string, unknown>) : null;
    const igUserId = igObj ? String(igObj.id ?? '') : '';
    if (!pageId || !pageAccessToken || !igUserId) continue;
    out.push({ pageId, pageName, pageAccessToken, igUserId });
  }
  return out;
}

export async function fetchInstagramBusinessProfile(params: {
  igUserId: string;
  pageAccessToken: string;
  fetchFn?: typeof fetch;
}): Promise<{ igUserId: string; username: string }> {
  const fetchFn = params.fetchFn ?? fetch;
  const q = new URLSearchParams({
    fields: 'id,username',
    access_token: params.pageAccessToken,
  });
  const res = await fetchFn(
    `${GRAPH}/${GRAPH_VERSION}/${encodeURIComponent(params.igUserId)}?${q.toString()}`
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errObj = json.error as { message?: string } | undefined;
    throw new Error(String(errObj?.message ?? json.error ?? `ig_profile_${res.status}`));
  }
  const igUserId = String(json.id ?? params.igUserId);
  const username = String(json.username ?? '');
  if (!igUserId) throw new Error('ig_profile_incomplete');
  return { igUserId, username };
}

/** Prefer Page whose IG id matches existing Instagram Login connection; else first linked Page. */
export function selectPageForConnection(params: {
  pages: FacebookPageWithIg[];
  preferredIgUserId?: string | null;
}): FacebookPageWithIg | null {
  if (!params.pages.length) return null;
  const preferred = params.preferredIgUserId?.trim();
  if (preferred) {
    const match = params.pages.find((p) => p.igUserId === preferred);
    if (match) return match;
  }
  return params.pages[0] ?? null;
}

export function sanitizeMetaError(message: string, maxLen = 280): string {
  return message
    .replace(/EAA[A-Za-z0-9]+/g, '[redacted]')
    .replace(/IGAA[A-Za-z0-9]+/g, '[redacted]')
    .replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]')
    .slice(0, maxLen);
}

export function appendOAuthDebug(
  message: string,
  debug: Record<string, string | number | boolean>
): string {
  const parts = Object.entries(debug).map(([k, v]) => `${k}=${String(v)}`);
  return sanitizeMetaError(`${message} | ${parts.join(' ')}`, 480);
}

// ---- inline: _shared/facebook-business-oauth/index.ts ----


/**
 * facebook-business-oauth — Phase B Facebook Login for Business (Music path).
 *
 * Parallel to instagram-oauth. Does NOT replace Instagram Login or publish.
 * Connect only — no Audio search, no audio_configuration, no music publish.
 *
 * Routes:
 * - POST { action: "start" | "disconnect" | "status" } + user JWT
 * - GET  ?code=&state=  (OAuth callback from Meta)
 * - GET  ?error=&state= (OAuth cancel / deny)
 *
 * Secrets (server only):
 * - META_APP_ID / META_APP_SECRET (shared Meta app)
 * - META_FACEBOOK_REDIRECT_URI (Valid OAuth Redirect URI for Facebook Login product)
 * - APP_ORIGIN / PUBLIC_APP_ORIGIN
 * - META_TOKEN_ENCRYPTION_KEY (optional; falls back to META_APP_SECRET)
 */


interface MembershipRow {
  id: string;
  org_id: string;
  role: string;
  status: string;
}

interface MetaEnv {
  appId: string;
  appSecret: string;
  redirectUri: string;
  appOrigin: string;
  tokenSecret: string;
}

function readMetaEnv(): MetaEnv | null {
  const appId = Deno.env.get('META_APP_ID')?.trim() ?? '';
  const appSecret = Deno.env.get('META_APP_SECRET')?.trim() ?? '';
  const redirectUri = normalizeRedirectUri(
    Deno.env.get('META_FACEBOOK_REDIRECT_URI') ?? Deno.env.get('FACEBOOK_BUSINESS_REDIRECT_URI') ?? ''
  );
  const appOrigin = (Deno.env.get('APP_ORIGIN') ?? Deno.env.get('PUBLIC_APP_ORIGIN') ?? '')
    .trim()
    .replace(/\/$/, '');
  if (!appId || !appSecret || !redirectUri || !appOrigin) return null;
  const tokenSecret = Deno.env.get('META_TOKEN_ENCRYPTION_KEY')?.trim() || appSecret;
  return { appId, appSecret, redirectUri, appOrigin, tokenSecret };
}

function oauthConfigured(): boolean {
  return readMetaEnv() !== null;
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
): Promise<{ userId: string; membership: MembershipRow } | Response> {
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
  return { userId: userData.user.id, membership: active };
}

const SAFE_COLS =
  'id, org_id, membership_id, fb_user_id, page_id, page_name, ig_user_id, ig_username, status, scopes, last_error, connected_at, disconnected_at, page_token_ref, created_at, updated_at';

function toSafeView(row: Record<string, unknown> | null): SafeFacebookBusinessConnectionView {
  if (!row) {
    return {
      status: 'disconnected',
      fbUserId: null,
      pageId: null,
      pageName: null,
      igUserId: null,
      igUsername: null,
      scopes: [],
      connectedAt: null,
      lastError: null,
      oauthConfigured: oauthConfigured(),
      instagramMusicAvailable: false,
    };
  }
  const scopes = (row.scopes as string[]) ?? [];
  const hasEncryptedPageToken = typeof row.page_token_ref === 'string' && row.page_token_ref.length > 0;
  const status = String(row.status ?? 'disconnected');
  return {
    status: dbStatusToUi(status),
    fbUserId: (row.fb_user_id as string | null) ?? null,
    pageId: (row.page_id as string | null) ?? null,
    pageName: (row.page_name as string | null) ?? null,
    igUserId: (row.ig_user_id as string | null) ?? null,
    igUsername: (row.ig_username as string | null) ?? null,
    scopes,
    connectedAt: (row.connected_at as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    oauthConfigured: oauthConfigured(),
    instagramMusicAvailable: resolveInstagramMusicAvailable({
      status,
      pageId: row.page_id as string | null,
      igUserId: row.ig_user_id as string | null,
      scopes,
      hasEncryptedPageToken,
    }),
  };
}

async function loadSafeConnection(
  db: SupabaseClient,
  orgId: string,
  membershipId: string
): Promise<SafeFacebookBusinessConnectionView> {
  const { data, error } = await db
    .from('content_facebook_business_connections')
    .select(SAFE_COLS)
    .eq('org_id', orgId)
    .eq('membership_id', membershipId)
    .maybeSingle();
  if (error) throw error;
  // Strip token column before returning — never send token_ref to client.
  const view = toSafeView(data as Record<string, unknown> | null);
  return view;
}

function frontendRedirect(origin: string, params: Record<string, string>): Response {
  const url = new URL('/heute/content', origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return Response.redirect(url.toString(), 302);
}

function isAllowedOrigin(candidate: string, configured: string): boolean {
  try {
    const a = new URL(candidate);
    const b = new URL(configured);
    return a.origin === b.origin;
  } catch {
    return false;
  }
}

async function fetchGrantedPermissions(params: {
  accessToken: string;
  fetchFn?: typeof fetch;
}): Promise<string[]> {
  const fetchFn = params.fetchFn ?? fetch;
  const q = new URLSearchParams({ access_token: params.accessToken });
  const res = await fetchFn(
    `https://graph.facebook.com/v25.0/me/permissions?${q.toString()}`
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return [...FB_MUSIC_CONNECT_SCOPES];
  const data = Array.isArray(json.data) ? json.data : [];
  const granted: string[] = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    if (rec.status === 'granted' && typeof rec.permission === 'string') {
      granted.push(rec.permission);
    }
  }
  return granted.length ? granted : [...FB_MUSIC_CONNECT_SCOPES];
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const codeRaw = url.searchParams.get('code');
      const code = codeRaw ? normalizeOAuthCode(codeRaw) : null;
      const state = url.searchParams.get('state');
      const oauthError = url.searchParams.get('error');
      const meta = readMetaEnv();
      if (!meta) {
        return json({ error: 'facebook_business_oauth_not_configured' }, 503);
      }

      if (oauthError) {
        const payload = state ? await verifyFbOAuthState(state, meta.tokenSecret) : null;
        if (payload && isOAuthUserCancel(oauthError)) {
          const admin = adminClient();
          await admin.from('content_facebook_business_connections').upsert(
            {
              org_id: payload.oid,
              membership_id: payload.mid,
              status: 'disconnected',
              last_error: null,
              disconnected_at: new Date().toISOString(),
            },
            { onConflict: 'org_id,membership_id' }
          );
          return frontendRedirect(meta.appOrigin, { fb: 'cancelled' });
        }
        if (payload) {
          const admin = adminClient();
          await admin.from('content_facebook_business_connections').upsert(
            {
              org_id: payload.oid,
              membership_id: payload.mid,
              status: 'error',
              last_error: sanitizeMetaError(oauthError),
            },
            { onConflict: 'org_id,membership_id' }
          );
        }
        return frontendRedirect(meta.appOrigin, {
          fb: isOAuthUserCancel(oauthError) ? 'cancelled' : 'denied',
        });
      }

      if (!code || !state) {
        return frontendRedirect(meta.appOrigin, { fb: 'error', reason: 'missing_code' });
      }

      const payload = await verifyFbOAuthState(state, meta.tokenSecret);
      if (!payload) {
        return frontendRedirect(meta.appOrigin, { fb: 'error', reason: 'invalid_state' });
      }

      const exchangeRedirectUri = normalizeRedirectUri(
        typeof payload.ruri === 'string' && payload.ruri ? payload.ruri : meta.redirectUri
      );
      const authDiag = describeRedirectUri(exchangeRedirectUri);
      const admin = adminClient();

      try {
        const short = await exchangeCodeForUserToken({
          appId: meta.appId,
          appSecret: meta.appSecret,
          redirectUri: exchangeRedirectUri,
          code,
        });
        const long = await exchangeForLongLivedUserToken({
          appId: meta.appId,
          appSecret: meta.appSecret,
          shortLivedToken: short.accessToken,
        });
        const fbUserId = await fetchFacebookUserId({ accessToken: long.accessToken });
        const scopes = await fetchGrantedPermissions({ accessToken: long.accessToken });
        const pages = await fetchPagesWithInstagramBusiness({
          userAccessToken: long.accessToken,
        });

        // Prefer matching the existing Instagram Login IG user when present.
        const { data: igConn } = await admin
          .from('content_instagram_connections')
          .select('ig_user_id')
          .eq('org_id', payload.oid)
          .eq('membership_id', payload.mid)
          .maybeSingle();

        const selected = selectPageForConnection({
          pages,
          preferredIgUserId: (igConn?.ig_user_id as string | null | undefined) ?? null,
        });
        if (!selected) {
          throw new Error('no_instagram_business_page');
        }

        const profile = await fetchInstagramBusinessProfile({
          igUserId: selected.igUserId,
          pageAccessToken: selected.pageAccessToken,
        });

        const userTokenRef = await encryptToken(long.accessToken, meta.tokenSecret);
        const pageTokenRef = await encryptToken(selected.pageAccessToken, meta.tokenSecret);
        const expiresAt =
          long.expiresIn > 0
            ? new Date(Date.now() + long.expiresIn * 1000).toISOString()
            : null;

        await admin.from('content_facebook_business_connections').upsert(
          {
            org_id: payload.oid,
            membership_id: payload.mid,
            fb_user_id: fbUserId,
            page_id: selected.pageId,
            page_name: selected.pageName || null,
            ig_user_id: profile.igUserId,
            ig_username: profile.username || null,
            status: 'connected',
            scopes,
            user_token_ref: userTokenRef,
            page_token_ref: pageTokenRef,
            token_expires_at: expiresAt,
            last_error: null,
            connected_at: new Date().toISOString(),
            disconnected_at: null,
          },
          { onConflict: 'org_id,membership_id' }
        );

        return frontendRedirect(meta.appOrigin, { fb: 'connected' });
      } catch (e) {
        const base = e instanceof Error ? e.message : 'oauth_failed';
        const msg = appendOAuthDebug(base, {
          redirect_uri: authDiag.redirectUri,
          len: authDiag.length,
          slash: authDiag.endsWithSlash ? 1 : 0,
          scheme: authDiag.scheme,
        });
        console.error('facebook_business_oauth_failed', {
          redirect_uri: authDiag.redirectUri,
          len: authDiag.length,
        });
        await admin.from('content_facebook_business_connections').upsert(
          {
            org_id: payload.oid,
            membership_id: payload.mid,
            status: 'error',
            last_error: msg,
            user_token_ref: null,
            page_token_ref: null,
          },
          { onConflict: 'org_id,membership_id' }
        );
        return frontendRedirect(meta.appOrigin, { fb: 'error', reason: 'token_exchange' });
      }
    }

    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const db = userClient(req);
    const resolved = await resolveMembership(db, req);
    if (resolved instanceof Response) return resolved;
    const { membership } = resolved;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'status');

    if (action === 'status') {
      const connection = await loadSafeConnection(db, membership.org_id, membership.id);
      return json({ ok: true, connection });
    }

    if (action === 'start') {
      const meta = readMetaEnv();
      if (!meta) return json({ error: 'facebook_business_oauth_not_configured' }, 503);

      const returnOrigin = String(body.returnOrigin ?? meta.appOrigin).replace(/\/$/, '');
      if (!isAllowedOrigin(returnOrigin, meta.appOrigin)) {
        return json({ error: 'invalid_return_origin' }, 400);
      }

      const redirectUri = meta.redirectUri;
      const state = await signFbOAuthState(
        {
          kind: 'fb_business',
          mid: membership.id,
          oid: membership.org_id,
          nonce: randomNonce(),
          exp: Math.floor(Date.now() / 1000) + 600,
          ruri: redirectUri,
        },
        meta.tokenSecret
      );

      const admin = adminClient();
      await admin.from('content_facebook_business_connections').upsert(
        {
          org_id: membership.org_id,
          membership_id: membership.id,
          status: 'pending_review',
          last_error: null,
        },
        { onConflict: 'org_id,membership_id' }
      );

      const authorizeUrl = buildFacebookBusinessAuthorizeUrl({
        appId: meta.appId,
        redirectUri,
        state,
      });

      const diag = describeRedirectUri(redirectUri);
      console.log('facebook_business_oauth_start', {
        redirect_uri: diag.redirectUri,
        len: diag.length,
        slash: diag.endsWithSlash,
        scheme: diag.scheme,
      });

      return json({
        ok: true,
        authorizeUrl,
        connection: await loadSafeConnection(db, membership.org_id, membership.id),
      });
    }

    if (action === 'disconnect') {
      const admin = adminClient();
      await admin
        .from('content_facebook_business_connections')
        .update({
          status: 'disconnected',
          user_token_ref: null,
          page_token_ref: null,
          fb_user_id: null,
          page_id: null,
          page_name: null,
          ig_user_id: null,
          ig_username: null,
          scopes: [],
          token_expires_at: null,
          last_error: null,
          disconnected_at: new Date().toISOString(),
        })
        .eq('org_id', membership.org_id)
        .eq('membership_id', membership.id);

      return json({
        ok: true,
        connection: await loadSafeConnection(db, membership.org_id, membership.id),
      });
    }

    return json({ error: 'unsupported_action', action }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'internal_error';
    return json({ error: 'internal_error', message: sanitizeMetaError(message) }, 500);
  }
});
