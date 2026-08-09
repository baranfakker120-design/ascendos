// AscendOS Edge Function: instagram-publish (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: instagram-publish
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/instagram-publish/index.ts

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

/** Connect + publish scopes for Business Login for Instagram (Phase 5C). */
export const IG_CONNECT_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
] as const;

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


// ---- inline: _shared/instagram-publish/types.ts ----
/** Instagram Content Publishing (Phase 5C) — official Graph path only. */

export const IG_PUBLISH_SCOPE = 'instagram_business_content_publish' as const;

/** Same Graph version as Phase 5A profile fetch. */
export const IG_GRAPH_API_VERSION = 'v25.0' as const;

export const IG_GRAPH_HOST = 'https://graph.instagram.com' as const;

export type PublishAttemptStatus =
  | 'queued'
  | 'submitted'
  | 'published'
  | 'failed'
  | 'cancelled';

export type ContentFormat = 'story' | 'feed' | 'reel';

export type MediaKind = 'image' | 'video';

export type PublishErrorCode =
  | 'not_authenticated'
  | 'no_active_membership'
  | 'confirm_required'
  | 'draft_not_found'
  | 'draft_not_ready'
  | 'asset_not_found'
  | 'not_connected'
  | 'missing_token'
  | 'missing_publish_permission'
  | 'missing_media'
  | 'missing_caption'
  | 'signed_url_failed'
  | 'container_failed'
  | 'container_timeout'
  | 'container_error'
  | 'publish_failed'
  | 'already_in_progress'
  | 'internal_error';

// ---- inline: _shared/instagram-publish/caption.ts ----
/** Caption assembly for Graph media containers (no secrets). */

export function formatHashtagsForPublish(hashtags: string[] | null | undefined): string {
  return (hashtags ?? [])
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith('#') ? h : `#${h}`))
    .join(' ');
}

/**
 * Build the Instagram caption sent to Meta.
 * CTA is appended as plain text (organic posts have no separate CTA Graph field).
 */
export function buildPublishCaption(params: {
  caption: string | null | undefined;
  hashtags?: string[] | null;
  cta?: string | null;
}): string {
  const body = (params.caption ?? '').trim();
  const cta = (params.cta ?? '').trim();
  const tags = formatHashtagsForPublish(params.hashtags);
  const parts: string[] = [];
  if (body) parts.push(body);
  if (cta) parts.push(cta);
  if (tags) parts.push(tags);
  return parts.join('\n\n');
}

// ---- inline: _shared/instagram-publish/graph.ts ----
/**
 * Official Instagram Content Publishing helpers (Instagram Login → graph.instagram.com).
 * Never log access tokens.
 */


export type ContainerStatusCode =
  | 'EXPIRED'
  | 'ERROR'
  | 'FINISHED'
  | 'IN_PROGRESS'
  | 'PUBLISHED'
  | string;

function graphUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${IG_GRAPH_HOST}/${IG_GRAPH_API_VERSION}${clean}`;
}

function readGraphError(json: Record<string, unknown>, fallback: string): string {
  const err = json.error as { message?: string; error_user_msg?: string; code?: number } | undefined;
  const msg = err?.error_user_msg || err?.message || json.error_message || json.error || fallback;
  return sanitizeMetaError(String(msg));
}

export function resolveMediaProduct(params: {
  mediaKind: MediaKind;
  format: ContentFormat;
}): {
  mediaType: 'IMAGE' | 'REELS' | 'STORIES' | null;
  useImageUrl: boolean;
  useVideoUrl: boolean;
} {
  const { mediaKind, format } = params;
  if (format === 'story') {
    return {
      mediaType: 'STORIES',
      useImageUrl: mediaKind === 'image',
      useVideoUrl: mediaKind === 'video',
    };
  }
  if (mediaKind === 'video' || format === 'reel') {
    return { mediaType: 'REELS', useImageUrl: false, useVideoUrl: true };
  }
  // Feed image — Meta accepts image_url without media_type.
  return { mediaType: null, useImageUrl: true, useVideoUrl: false };
}

export async function createMediaContainer(params: {
  igUserId: string;
  accessToken: string;
  mediaKind: MediaKind;
  format: ContentFormat;
  mediaUrl: string;
  caption: string;
  fetchFn?: typeof fetch;
}): Promise<{ containerId: string }> {
  const fetchFn = params.fetchFn ?? fetch;
  const product = resolveMediaProduct({
    mediaKind: params.mediaKind,
    format: params.format,
  });

  if (product.useVideoUrl && params.mediaKind !== 'video') {
    throw new Error('container_requires_video');
  }
  if (product.useImageUrl && params.mediaKind !== 'image') {
    throw new Error('container_requires_image');
  }

  const body = new URLSearchParams();
  body.set('access_token', params.accessToken);
  if (product.useImageUrl) body.set('image_url', params.mediaUrl);
  if (product.useVideoUrl) body.set('video_url', params.mediaUrl);
  if (product.mediaType) body.set('media_type', product.mediaType);
  // Feed/Reels captions; Stories omit caption (not a feed caption field).
  if (params.caption && product.mediaType !== 'STORIES') {
    body.set('caption', params.caption);
  }

  const res = await fetchFn(graphUrl(`/${params.igUserId}/media`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(readGraphError(json, `container_${res.status}`));
  }
  const containerId = String(json.id ?? '');
  if (!containerId) throw new Error('container_missing_id');
  return { containerId };
}

export async function getContainerStatus(params: {
  containerId: string;
  accessToken: string;
  fetchFn?: typeof fetch;
}): Promise<{ statusCode: ContainerStatusCode; status?: string }> {
  const fetchFn = params.fetchFn ?? fetch;
  const q = new URLSearchParams({
    fields: 'status_code,status',
    access_token: params.accessToken,
  });
  const res = await fetchFn(graphUrl(`/${params.containerId}?${q.toString()}`));
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(readGraphError(json, `container_status_${res.status}`));
  }
  return {
    statusCode: String(json.status_code ?? 'IN_PROGRESS') as ContainerStatusCode,
    status: json.status != null ? String(json.status) : undefined,
  };
}

export async function waitForContainerReady(params: {
  containerId: string;
  accessToken: string;
  fetchFn?: typeof fetch;
  maxAttempts?: number;
  delayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<void> {
  const maxAttempts = params.maxAttempts ?? 45;
  const delayMs = params.delayMs ?? 2000;
  const sleepFn =
    params.sleepFn ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  for (let i = 0; i < maxAttempts; i++) {
    const { statusCode } = await getContainerStatus({
      containerId: params.containerId,
      accessToken: params.accessToken,
      fetchFn: params.fetchFn,
    });
    if (statusCode === 'FINISHED' || statusCode === 'PUBLISHED') return;
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      throw new Error(`container_${statusCode.toLowerCase()}`);
    }
    await sleepFn(delayMs);
  }
  throw new Error('container_timeout');
}

export async function publishMediaContainer(params: {
  igUserId: string;
  accessToken: string;
  containerId: string;
  fetchFn?: typeof fetch;
}): Promise<{ mediaId: string }> {
  const fetchFn = params.fetchFn ?? fetch;
  const body = new URLSearchParams({
    creation_id: params.containerId,
    access_token: params.accessToken,
  });
  const res = await fetchFn(graphUrl(`/${params.igUserId}/media_publish`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(readGraphError(json, `media_publish_${res.status}`));
  }
  const mediaId = String(json.id ?? '');
  if (!mediaId) throw new Error('media_publish_missing_id');
  return { mediaId };
}

export function connectionHasPublishScope(scopes: string[] | null | undefined): boolean {
  return (scopes ?? []).includes('instagram_business_content_publish');
}

// ---- inline: _shared/instagram-publish/index.ts ----


/**
 * instagram-publish — Phase 5C official Instagram Graph Content Publishing.
 *
 * Official Meta path only (graph.instagram.com).
 * Requires explicit user confirmation in the request body.
 * Reuses encrypted token_ref from content_instagram_connections (decrypt server-side).
 * Does not modify the oauth start/callback flow.
 *
 * POST { action: "publish", draftId, confirmed: true } + user JWT
 */


/** Same private bucket as content-generate (avoid bundling that group here). */
const CONTENT_ASSETS_BUCKET = 'content-assets';

interface MembershipRow {
  id: string;
  org_id: string;
  role: string;
  status: string;
}

interface DraftRow {
  id: string;
  org_id: string;
  owner_membership_id: string;
  asset_id: string;
  format: ContentFormat;
  caption: string | null;
  cta: string | null;
  hashtags: string[] | null;
  status: string;
}

interface AssetRow {
  id: string;
  org_id: string;
  storage_path: string;
  media_kind: MediaKind;
  mime_type: string;
}

interface ConnectionRow {
  id: string;
  org_id: string;
  membership_id: string;
  ig_user_id: string | null;
  ig_username: string | null;
  status: string;
  scopes: string[] | null;
  token_ref: string | null;
}

interface AttemptRow {
  id: string;
  status: string;
  meta_container_id: string | null;
  meta_media_id: string | null;
  error_message: string | null;
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
  if (authError || !userData.user) return json({ ok: false, error: 'not_authenticated' }, 401);

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
  if (!active) return json({ ok: false, error: 'no_active_membership' }, 403);
  return { userId: userData.user.id, membership: active };
}

function safePublishResponse(payload: Record<string, unknown>, status = 200): Response {
  const body = JSON.stringify(payload);
  if (/"token_ref"\s*:/.test(body) || /"access_token"\s*:/.test(body) || /"accessToken"\s*:/.test(body)) {
    console.error('instagram_publish_token_leak_blocked');
    return json({ ok: false, error: 'internal_error' }, 500);
  }
  return json(payload, status);
}

async function markAttemptFailed(
  admin: SupabaseClient,
  attemptId: string,
  message: string
): Promise<void> {
  const { error } = await admin
    .from('content_publish_attempts')
    .update({
      status: 'failed',
      error_message: sanitizeMetaError(message),
    })
    .eq('id', attemptId)
    .in('status', ['queued', 'submitted']);
  if (error) {
    console.error('instagram_publish_mark_failed_error', error.message);
  }
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      draftId?: string;
      confirmed?: boolean;
    };

    if (body.action !== 'publish') {
      return json({ ok: false, error: 'unknown_action' }, 400);
    }
    if (body.confirmed !== true) {
      return json({ ok: false, error: 'confirm_required' }, 400);
    }
    const draftId = typeof body.draftId === 'string' ? body.draftId.trim() : '';
    if (!draftId) return json({ ok: false, error: 'draft_not_found' }, 400);

    const db = userClient(req);
    const resolved = await resolveMembership(db, req);
    if (resolved instanceof Response) return resolved;
    const { membership } = resolved;
    const admin = adminClient();

    const { data: draftRaw, error: draftErr } = await db
      .from('content_drafts')
      .select('id, org_id, owner_membership_id, asset_id, format, caption, cta, hashtags, status')
      .eq('id', draftId)
      .maybeSingle();
    if (draftErr) throw draftErr;
    const draft = draftRaw as DraftRow | null;
    if (!draft || draft.org_id !== membership.org_id || draft.owner_membership_id !== membership.id) {
      return json({ ok: false, error: 'draft_not_found' }, 404);
    }
    if (draft.status !== 'ready') {
      return json({ ok: false, error: 'draft_not_ready' }, 400);
    }

    const { data: assetRaw, error: assetErr } = await db
      .from('content_assets')
      .select('id, org_id, storage_path, media_kind, mime_type')
      .eq('id', draft.asset_id)
      .maybeSingle();
    if (assetErr) throw assetErr;
    const asset = assetRaw as AssetRow | null;
    if (!asset || asset.org_id !== membership.org_id || !asset.storage_path) {
      return json({ ok: false, error: 'asset_not_found' }, 404);
    }

    const caption = buildPublishCaption({
      caption: draft.caption,
      hashtags: draft.hashtags,
      cta: draft.cta,
    });
    if (!caption && draft.format !== 'story') {
      return json({ ok: false, error: 'missing_caption' }, 400);
    }

    // token_ref only via service role — never selected with user client for responses.
    const { data: connRaw, error: connErr } = await admin
      .from('content_instagram_connections')
      .select('id, org_id, membership_id, ig_user_id, ig_username, status, scopes, token_ref')
      .eq('org_id', membership.org_id)
      .eq('membership_id', membership.id)
      .maybeSingle();
    if (connErr) throw connErr;
    const connection = connRaw as ConnectionRow | null;
    if (!connection || connection.status !== 'connected' || !connection.ig_user_id) {
      return json({ ok: false, error: 'not_connected' }, 400);
    }
    if (!connection.token_ref) {
      return json({ ok: false, error: 'missing_token' }, 400);
    }
    if (!connectionHasPublishScope(connection.scopes)) {
      console.error('instagram_publish_missing_scope', {
        required: IG_PUBLISH_SCOPE,
        have: connection.scopes ?? [],
      });
      return safePublishResponse(
        {
          ok: false,
          error: 'missing_publish_permission',
          message:
            'Instagram-Berechtigung instagram_business_content_publish fehlt. Bitte im Meta Developer Dashboard freischalten und Instagram in AscendOS erneut verbinden.',
          requiredScope: IG_PUBLISH_SCOPE,
        },
        403
      );
    }

    // Idempotency: already published for this draft → return success, no second post.
    const { data: publishedRows, error: pubLookupErr } = await admin
      .from('content_publish_attempts')
      .select('id, status, meta_container_id, meta_media_id, error_message')
      .eq('draft_id', draft.id)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(1);
    if (pubLookupErr) throw pubLookupErr;
    const already = (publishedRows as AttemptRow[] | null)?.[0];
    if (already?.meta_media_id) {
      return safePublishResponse({
        ok: true,
        status: 'published',
        alreadyPublished: true,
        attemptId: already.id,
        mediaId: already.meta_media_id,
        igUsername: connection.ig_username,
      });
    }

    const { data: activeRows, error: activeErr } = await admin
      .from('content_publish_attempts')
      .select('id, status, meta_container_id, meta_media_id, error_message')
      .eq('draft_id', draft.id)
      .in('status', ['queued', 'submitted'])
      .order('created_at', { ascending: false })
      .limit(1);
    if (activeErr) throw activeErr;
    let attempt = (activeRows as AttemptRow[] | null)?.[0] ?? null;

    if (attempt?.status === 'submitted' && attempt.meta_container_id) {
      // Resume in-flight container instead of creating a second one.
      console.log('instagram_publish_resume', { attemptId: attempt.id });
    } else if (attempt?.status === 'queued') {
      // Another request is likely still creating the container.
      return safePublishResponse(
        {
          ok: false,
          error: 'already_in_progress',
          attemptId: attempt.id,
          message: 'Veröffentlichung läuft bereits — bitte kurz warten.',
        },
        409
      );
    } else {
      const { data: inserted, error: insertErr } = await admin
        .from('content_publish_attempts')
        .insert({
          org_id: membership.org_id,
          membership_id: membership.id,
          draft_id: draft.id,
          connection_id: connection.id,
          status: 'queued',
          user_confirmed_at: new Date().toISOString(),
        })
        .select('id, status, meta_container_id, meta_media_id, error_message')
        .single();

      if (insertErr) {
        // Unique active-draft index → concurrent double-click.
        if (insertErr.code === '23505') {
          return safePublishResponse(
            {
              ok: false,
              error: 'already_in_progress',
              message: 'Veröffentlichung läuft bereits — bitte kurz warten.',
            },
            409
          );
        }
        throw insertErr;
      }
      attempt = inserted as AttemptRow;
    }

    if (!attempt) {
      return json({ ok: false, error: 'internal_error' }, 500);
    }

    const secret = tokenSecret();
    if (!secret) {
      await markAttemptFailed(admin, attempt.id, 'missing_encryption_secret');
      return json({ ok: false, error: 'missing_token' }, 500);
    }

    let accessToken: string;
    try {
      accessToken = await decryptToken(connection.token_ref, secret);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'decrypt_failed';
      console.error('instagram_publish_decrypt_failed', sanitizeMetaError(msg));
      await markAttemptFailed(admin, attempt.id, 'token_decrypt_failed');
      return json({ ok: false, error: 'missing_token' }, 500);
    }

    let containerId = attempt.meta_container_id;

    try {
      if (!containerId) {
        const { data: signed, error: signErr } = await admin.storage
          .from(CONTENT_ASSETS_BUCKET)
          .createSignedUrl(asset.storage_path, 7200);
        if (signErr || !signed?.signedUrl) {
          console.error('instagram_publish_signed_url_failed', signErr?.message);
          await markAttemptFailed(admin, attempt.id, 'signed_url_failed');
          return json({ ok: false, error: 'signed_url_failed' }, 500);
        }

        const created = await createMediaContainer({
          igUserId: connection.ig_user_id,
          accessToken,
          mediaKind: asset.media_kind,
          format: draft.format,
          mediaUrl: signed.signedUrl,
          caption,
        });
        containerId = created.containerId;

        const { error: submitErr } = await admin
          .from('content_publish_attempts')
          .update({
            status: 'submitted',
            meta_container_id: containerId,
            error_message: null,
          })
          .eq('id', attempt.id)
          .eq('status', 'queued');
        if (submitErr) throw submitErr;
      }

      // Videos/reels/stories need processing; feed images can publish immediately.
      if (asset.media_kind === 'video' || draft.format === 'reel' || draft.format === 'story') {
        await waitForContainerReady({
          containerId,
          accessToken,
        });
      }

      const published = await publishMediaContainer({
        igUserId: connection.ig_user_id,
        accessToken,
        containerId,
      });

      const { error: doneErr } = await admin
        .from('content_publish_attempts')
        .update({
          status: 'published',
          meta_container_id: containerId,
          meta_media_id: published.mediaId,
          error_message: null,
        })
        .eq('id', attempt.id)
        .in('status', ['queued', 'submitted']);
      if (doneErr) throw doneErr;

      console.log('instagram_publish_ok', {
        attemptId: attempt.id,
        draftId: draft.id,
        mediaKind: asset.media_kind,
        format: draft.format,
      });

      return safePublishResponse({
        ok: true,
        status: 'published',
        alreadyPublished: false,
        attemptId: attempt.id,
        mediaId: published.mediaId,
        containerId,
        igUsername: connection.ig_username,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'publish_failed';
      const sanitized = sanitizeMetaError(msg);
      console.error('instagram_publish_graph_error', sanitized);
      await markAttemptFailed(admin, attempt.id, sanitized);

      let error = 'publish_failed';
      if (sanitized.includes('container_timeout')) error = 'container_timeout';
      else if (sanitized.includes('container_error') || sanitized.includes('container_expired'))
        error = 'container_error';
      else if (sanitized.includes('container_')) error = 'container_failed';

      return safePublishResponse(
        {
          ok: false,
          error,
          attemptId: attempt.id,
          message: sanitized,
        },
        502
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal_error';
    console.error('instagram_publish_internal', sanitizeMetaError(msg));
    return json({ ok: false, error: 'internal_error' }, 500);
  }
});
