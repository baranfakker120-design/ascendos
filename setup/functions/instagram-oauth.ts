// AscendOS Edge Function: instagram-oauth (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: instagram-oauth
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/instagram-oauth/index.ts

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

// ---- inline: _shared/instagram-oauth/types.ts ----
/** Instagram OAuth (Phase 5A — connect only). Official Meta Business Login path. */

export const IG_CONNECT_SCOPES = ['instagram_business_basic'] as const;

/** DB CHECK values on content_instagram_connections.status */
export type IgConnectionDbStatus = 'disconnected' | 'pending_review' | 'connected' | 'error';

/** UI / API-facing status (maps pending_review → connecting) */
export type IgConnectionUiStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface OAuthStatePayload {
  mid: string; // membership_id
  oid: string; // org_id
  nonce: string;
  exp: number; // unix seconds
  /**
   * Exact redirect_uri used in the authorize dialog (after normalizeRedirectUri).
   * Callback must reuse this byte-for-byte for the token exchange.
   * Optional only to tolerate in-flight states during deploy.
   */
  ruri?: string;
}

export interface SafeConnectionView {
  status: IgConnectionUiStatus;
  igUserId: string | null;
  igUsername: string | null;
  scopes: string[];
  connectedAt: string | null;
  lastError: string | null;
  /** True when META_* secrets are present server-side. Never exposes secret values. */
  oauthConfigured: boolean;
}

export function dbStatusToUi(status: string | null | undefined): IgConnectionUiStatus {
  if (status === 'connected') return 'connected';
  if (status === 'error') return 'error';
  if (status === 'pending_review') return 'connecting';
  return 'disconnected';
}

export function uiStatusToDb(status: IgConnectionUiStatus): IgConnectionDbStatus {
  if (status === 'connecting') return 'pending_review';
  return status;
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

// ---- inline: _shared/instagram-oauth/crypto.ts ----
/**
 * Token encryption + OAuth state HMAC (Web Crypto).
 * Never log plaintext tokens or keys.
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

async function importAesKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', textEncoder.encode(secret));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
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
  const iv = fromBase64Url(parts[1]);
  const data = fromBase64Url(parts[2]);
  const key = await importAesKey(secret);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return textDecoder.decode(plain);
}

export async function signOAuthState(
  payload: OAuthStatePayload,
  secret: string
): Promise<string> {
  const body = toBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifyOAuthState(
  state: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000)
): Promise<OAuthStatePayload | null> {
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
    const payload = JSON.parse(textDecoder.decode(fromBase64Url(body))) as OAuthStatePayload;
    if (!payload?.mid || !payload?.oid || !payload?.nonce || !payload?.exp) return null;
    if (payload.exp < nowSec) return null;
    // New flows always set ruri; tolerate missing on in-flight states mid-deploy.
    if (typeof payload.ruri === 'string') {
      payload.ruri = payload.ruri.trim();
    } else {
      delete payload.ruri;
    }
    return payload;
  } catch {
    return null;
  }
}

export function randomNonce(bytes = 16): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

// ---- inline: _shared/instagram-oauth/meta.ts ----
/** Official Meta / Instagram Login HTTP helpers (Phase 5A connect only). */


const AUTH_URL = 'https://www.instagram.com/oauth/authorize';
const TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const GRAPH = 'https://graph.instagram.com';

/**
 * Normalize META_REDIRECT_URI for authorize + token exchange.
 * Trim + strip wrapping quotes only — preserve trailing slash exactly as configured
 * (Meta App Dashboard often auto-appends `/` and compares strings character-for-character).
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

/** Instagram appends `#_` to the redirect; strip if it ever lands in `code`. */
export function normalizeOAuthCode(raw: string): string {
  return raw.trim().split('#')[0]!.trim();
}

/** Safe redirect_uri diagnostics — never includes secrets or auth codes. */
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

export function buildAuthorizeUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
}): string {
  const scope = (params.scopes ?? IG_CONNECT_SCOPES).join(',');
  const redirectUri = normalizeRedirectUri(params.redirectUri);
  const q = new URLSearchParams({
    client_id: params.appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state: params.state,
  });
  return `${AUTH_URL}?${q.toString()}`;
}

export interface ShortLivedTokenResult {
  accessToken: string;
  userId: string;
  permissions: string[];
}

function readTokenExchangeRow(json: Record<string, unknown>): Record<string, unknown> {
  // Meta may return a flat object or `{ data: [ { access_token, user_id, ... } ] }`.
  if (Array.isArray(json.data) && json.data[0] && typeof json.data[0] === 'object') {
    return json.data[0] as Record<string, unknown>;
  }
  return json;
}

export async function exchangeCodeForShortLivedToken(params: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
  fetchFn?: typeof fetch;
}): Promise<ShortLivedTokenResult> {
  const fetchFn = params.fetchFn ?? fetch;
  const redirectUri = normalizeRedirectUri(params.redirectUri);
  const code = normalizeOAuthCode(params.code);

  // Meta accepts form-urlencoded; URLSearchParams matches working IG Business Login clients
  // and avoids Deno FormData multipart quirks that can surface as redirect_uri mismatches.
  const body = new URLSearchParams({
    client_id: params.appId,
    client_secret: params.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.error_message ?? json.error ?? `token_exchange_${res.status}`));
  }
  const row = readTokenExchangeRow(json);
  const accessToken = String(row.access_token ?? '');
  const userId = String(row.user_id ?? '');
  if (!accessToken) throw new Error('token_exchange_missing_access_token');
  const permissionsRaw = row.permissions ?? json.permissions;
  const permissions = Array.isArray(permissionsRaw)
    ? permissionsRaw.map(String)
    : typeof permissionsRaw === 'string' && permissionsRaw
      ? permissionsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : [...IG_CONNECT_SCOPES];
  return { accessToken, userId, permissions };
}

export async function exchangeForLongLivedToken(params: {
  appSecret: string;
  shortLivedToken: string;
  fetchFn?: typeof fetch;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const fetchFn = params.fetchFn ?? fetch;
  const q = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: params.appSecret,
    access_token: params.shortLivedToken,
  });
  const res = await fetchFn(`${GRAPH}/access_token?${q.toString()}`);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.error_message ?? json.error ?? `long_lived_${res.status}`));
  }
  const accessToken = String(json.access_token ?? '');
  if (!accessToken) throw new Error('long_lived_missing_access_token');
  return {
    accessToken,
    expiresIn: Number(json.expires_in ?? 0) || 0,
  };
}

export async function fetchIgProfile(params: {
  accessToken: string;
  fetchFn?: typeof fetch;
}): Promise<{ userId: string; username: string }> {
  const fetchFn = params.fetchFn ?? fetch;
  const q = new URLSearchParams({
    fields: 'user_id,username',
    access_token: params.accessToken,
  });
  const res = await fetchFn(`${GRAPH}/v25.0/me?${q.toString()}`);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errObj = json.error as { message?: string } | undefined;
    throw new Error(String(errObj?.message ?? json.error ?? `profile_${res.status}`));
  }
  const userId = String(json.user_id ?? json.id ?? '');
  const username = String(json.username ?? '');
  if (!userId || !username) throw new Error('profile_incomplete');
  return { userId, username };
}

/** Strip secrets from error strings before persisting/returning. */
export function sanitizeMetaError(message: string, maxLen = 280): string {
  return message
    .replace(/EAA[A-Za-z0-9]+/g, '[redacted]')
    .replace(/IGAA[A-Za-z0-9]+/g, '[redacted]')
    .replace(/access_token=[^&\s]+/gi, 'access_token=[redacted]')
    .slice(0, maxLen);
}

/** Append safe OAuth debug suffix to a sanitized error (no secrets/codes). */
export function appendOAuthDebug(
  message: string,
  debug: Record<string, string | number | boolean>
): string {
  const parts = Object.entries(debug).map(([k, v]) => `${k}=${String(v)}`);
  // Allow room for redirect_uri diagnostics in last_error.
  return sanitizeMetaError(`${message} | ${parts.join(' ')}`, 480);
}

// ---- inline: _shared/instagram-oauth/index.ts ----


/**
 * instagram-oauth — Phase 5A Instagram Professional account connection.
 *
 * Official Meta Business Login for Instagram only.
 * Connect only — no publishing, no content_publish_attempts, no Graph publish calls.
 *
 * Routes:
 * - POST { action: "start" | "disconnect" | "status" } + user JWT
 * - GET  ?code=&state=  (OAuth callback from Meta)
 * - GET  ?error=&state= (OAuth cancel / deny)
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
  // One canonical redirect URI for authorize URL AND code exchange.
  const redirectUri = normalizeRedirectUri(Deno.env.get('META_REDIRECT_URI') ?? '');
  const appOrigin = (Deno.env.get('APP_ORIGIN') ?? Deno.env.get('PUBLIC_APP_ORIGIN') ?? '')
    .trim()
    .replace(/\/$/, '');
  if (!appId || !appSecret || !redirectUri || !appOrigin) return null;
  const tokenSecret =
    Deno.env.get('META_TOKEN_ENCRYPTION_KEY')?.trim() ||
    appSecret; /* fallback: encrypt with app secret */
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
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
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
  'id, org_id, membership_id, ig_user_id, ig_username, status, scopes, last_error, connected_at, disconnected_at, created_at, updated_at';

async function loadSafeConnection(
  db: SupabaseClient,
  orgId: string,
  membershipId: string
): Promise<SafeConnectionView> {
  const { data, error } = await db
    .from('content_instagram_connections')
    .select(SAFE_COLS)
    .eq('org_id', orgId)
    .eq('membership_id', membershipId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      status: 'disconnected',
      igUserId: null,
      igUsername: null,
      scopes: [],
      connectedAt: null,
      lastError: null,
      oauthConfigured: oauthConfigured(),
    };
  }
  return {
    status: dbStatusToUi(data.status),
    igUserId: data.ig_user_id ?? null,
    igUsername: data.ig_username ?? null,
    scopes: (data.scopes as string[]) ?? [],
    connectedAt: data.connected_at ?? null,
    lastError: data.last_error ?? null,
    oauthConfigured: oauthConfigured(),
  };
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

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const url = new URL(req.url);

    // ---- OAuth callback (GET from Meta) ----
    if (req.method === 'GET') {
      const codeRaw = url.searchParams.get('code');
      const code = codeRaw ? normalizeOAuthCode(codeRaw) : null;
      const state = url.searchParams.get('state');
      const oauthError = url.searchParams.get('error');
      const meta = readMetaEnv();
      if (!meta) {
        return json({ error: 'instagram_oauth_not_configured' }, 503);
      }

      if (oauthError) {
        const payload = state ? await verifyOAuthState(state, meta.tokenSecret) : null;
        if (payload && isOAuthUserCancel(oauthError)) {
          const admin = adminClient();
          await admin
            .from('content_instagram_connections')
            .upsert(
              {
                org_id: payload.oid,
                membership_id: payload.mid,
                status: 'disconnected',
                last_error: null,
                disconnected_at: new Date().toISOString(),
              },
              { onConflict: 'org_id,membership_id' }
            );
          return frontendRedirect(meta.appOrigin, { ig: 'cancelled' });
        }
        if (payload) {
          const admin = adminClient();
          await admin
            .from('content_instagram_connections')
            .upsert(
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
          ig: isOAuthUserCancel(oauthError) ? 'cancelled' : 'denied',
        });
      }

      if (!code || !state) {
        return frontendRedirect(meta.appOrigin, { ig: 'error', reason: 'missing_code' });
      }

      const payload = await verifyOAuthState(state, meta.tokenSecret);
      if (!payload) {
        return frontendRedirect(meta.appOrigin, { ig: 'error', reason: 'invalid_state' });
      }

      // Prefer the exact redirect_uri that was signed into authorize state.
      const exchangeRedirectUri = normalizeRedirectUri(
        typeof payload.ruri === 'string' && payload.ruri ? payload.ruri : meta.redirectUri
      );
      const authDiag = describeRedirectUri(
        typeof payload.ruri === 'string' && payload.ruri ? payload.ruri : meta.redirectUri
      );
      const envDiag = describeRedirectUri(meta.redirectUri);
      const codeHadHash = Boolean(codeRaw && codeRaw.includes('#'));

      const admin = adminClient();
      try {
        const short = await exchangeCodeForShortLivedToken({
          appId: meta.appId,
          appSecret: meta.appSecret,
          redirectUri: exchangeRedirectUri,
          code,
        });
        const long = await exchangeForLongLivedToken({
          appSecret: meta.appSecret,
          shortLivedToken: short.accessToken,
        });
        const profile = await fetchIgProfile({ accessToken: long.accessToken });
        const tokenRef = await encryptToken(long.accessToken, meta.tokenSecret);

        await admin.from('content_instagram_connections').upsert(
          {
            org_id: payload.oid,
            membership_id: payload.mid,
            ig_user_id: profile.userId,
            ig_username: profile.username,
            status: 'connected',
            scopes: short.permissions.length ? short.permissions : [...IG_CONNECT_SCOPES],
            token_ref: tokenRef,
            last_error: null,
            connected_at: new Date().toISOString(),
            disconnected_at: null,
          },
          { onConflict: 'org_id,membership_id' }
        );

        // Ensure we never return tokens — redirect only.
        return frontendRedirect(meta.appOrigin, { ig: 'connected' });
      } catch (e) {
        const base = e instanceof Error ? e.message : 'oauth_failed';
        const msg = appendOAuthDebug(base, {
          redirect_uri: authDiag.redirectUri,
          len: authDiag.length,
          slash: authDiag.endsWithSlash ? 1 : 0,
          scheme: authDiag.scheme,
          query: authDiag.hasQuery ? 1 : 0,
          space: authDiag.hasSpace ? 1 : 0,
          ruri_state: typeof payload.ruri === 'string' && payload.ruri ? 1 : 0,
          env_match: authDiag.redirectUri === envDiag.redirectUri ? 1 : 0,
          code_hash: codeHadHash ? 1 : 0,
          code_len: code.length,
        });
        console.error('instagram_oauth_token_exchange_failed', {
          redirect_uri: authDiag.redirectUri,
          len: authDiag.length,
          slash: authDiag.endsWithSlash,
          ruri_state: Boolean(payload.ruri),
          env_match: authDiag.redirectUri === envDiag.redirectUri,
          code_hash: codeHadHash,
          code_len: code.length,
        });
        await admin.from('content_instagram_connections').upsert(
          {
            org_id: payload.oid,
            membership_id: payload.mid,
            status: 'error',
            last_error: msg,
            token_ref: null,
          },
          { onConflict: 'org_id,membership_id' }
        );
        return frontendRedirect(meta.appOrigin, { ig: 'error', reason: 'token_exchange' });
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
      return json({ ok: true, connection, publishingEnabled: false });
    }

    if (action === 'start') {
      const meta = readMetaEnv();
      if (!meta) return json({ error: 'instagram_oauth_not_configured' }, 503);

      // Optional client-supplied return origin must match configured APP_ORIGIN.
      const returnOrigin = String(body.returnOrigin ?? meta.appOrigin).replace(/\/$/, '');
      if (!isAllowedOrigin(returnOrigin, meta.appOrigin)) {
        return json({ error: 'invalid_return_origin' }, 400);
      }

      const redirectUri = meta.redirectUri;
      const state = await signOAuthState(
        {
          mid: membership.id,
          oid: membership.org_id,
          nonce: randomNonce(),
          exp: Math.floor(Date.now() / 1000) + 600,
          ruri: redirectUri,
        },
        meta.tokenSecret
      );

      const admin = adminClient();
      await admin.from('content_instagram_connections').upsert(
        {
          org_id: membership.org_id,
          membership_id: membership.id,
          status: 'pending_review',
          last_error: null,
        },
        { onConflict: 'org_id,membership_id' }
      );

      const authorizeUrl = buildAuthorizeUrl({
        appId: meta.appId,
        redirectUri,
        state,
      });

      const diag = describeRedirectUri(redirectUri);
      console.log('instagram_oauth_start', {
        redirect_uri: diag.redirectUri,
        len: diag.length,
        slash: diag.endsWithSlash,
        scheme: diag.scheme,
      });

      return json({
        ok: true,
        authorizeUrl,
        connection: await loadSafeConnection(db, membership.org_id, membership.id),
        publishingEnabled: false,
      });
    }

    if (action === 'disconnect') {
      const admin = adminClient();
      // Clear encrypted token; never return it.
      await admin
        .from('content_instagram_connections')
        .update({
          status: 'disconnected',
          token_ref: null,
          ig_user_id: null,
          ig_username: null,
          scopes: [],
          last_error: null,
          disconnected_at: new Date().toISOString(),
        })
        .eq('org_id', membership.org_id)
        .eq('membership_id', membership.id);

      return json({
        ok: true,
        connection: await loadSafeConnection(db, membership.org_id, membership.id),
        publishingEnabled: false,
      });
    }

    return json({ error: 'unsupported_action', action }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'internal_error';
    return json({ error: 'internal_error', message: sanitizeMetaError(message) }, 500);
  }
});
