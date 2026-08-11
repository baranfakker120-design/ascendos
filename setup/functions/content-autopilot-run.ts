// AscendOS Edge Function: content-autopilot-run (Dashboard-Version, alles in einer Datei)
// Name der Function MUSS exakt lauten: content-autopilot-run
//
// GENERIERT von scripts/bundle-functions.mjs — NICHT von Hand ändern.
// Quelle: supabase/functions/content-autopilot-run/index.ts

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

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
  | 'unsupported_video_format'
  | 'video_file_too_large'
  | 'video_too_short'
  | 'video_too_long'
  | 'video_resolution_invalid'
  | 'video_aspect_invalid'
  | 'video_not_ready'
  | 'audio_unavailable'
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


/**
 * Meta IG Container `status_code` values (official docs):
 * EXPIRED | ERROR | FINISHED | IN_PROGRESS | PUBLISHED
 * Unknown non-terminal values are treated as pending (keep polling).
 */
export type ContainerStatusCode =
  | 'EXPIRED'
  | 'ERROR'
  | 'FINISHED'
  | 'IN_PROGRESS'
  | 'PUBLISHED'
  | string;

export type ContainerReadiness = 'ready' | 'pending' | 'error' | 'expired';

/** Polling defaults — bounded, no infinite loop. */
export const CONTAINER_POLL_DEFAULTS = {
  /** Wait before first status check (lets Meta start processing / fetch image_url). */
  initialDelayMs: 2000,
  /** Delay between subsequent status checks. */
  intervalMs: 2000,
  /** Max status checks after the initial delay (~2s + 30×2s ≈ 62s). */
  maxAttempts: 30,
} as const;

export function classifyContainerStatus(statusCode: string | null | undefined): ContainerReadiness {
  const code = String(statusCode ?? '')
    .trim()
    .toUpperCase();
  if (code === 'FINISHED' || code === 'PUBLISHED') return 'ready';
  if (code === 'ERROR') return 'error';
  if (code === 'EXPIRED') return 'expired';
  // IN_PROGRESS, empty, or any other non-terminal → keep waiting
  return 'pending';
}

export function pollConfigForMedia(mediaKind: MediaKind): {
  initialDelayMs: number;
  intervalMs: number;
  maxAttempts: number;
} {
  if (mediaKind === 'video') {
    return {
      initialDelayMs: 3000,
      intervalMs: 3000,
      maxAttempts: 40, // ~3s + 40×3s ≈ 123s
    };
  }
  return { ...CONTAINER_POLL_DEFAULTS };
}

function graphUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${IG_GRAPH_HOST}/${IG_GRAPH_API_VERSION}${clean}`;
}

function readGraphError(json: Record<string, unknown>, fallback: string): string {
  const err = json.error as
    | { message?: string; error_user_msg?: string; code?: number; error_subcode?: number }
    | undefined;
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
  shareToFeed: boolean;
} {
  const { mediaKind, format } = params;
  if (format === 'story') {
    return {
      mediaType: 'STORIES',
      useImageUrl: mediaKind === 'image',
      useVideoUrl: mediaKind === 'video',
      shareToFeed: false,
    };
  }
  if (mediaKind === 'video' || format === 'reel') {
    return {
      mediaType: 'REELS',
      useImageUrl: false,
      useVideoUrl: true,
      shareToFeed: true,
    };
  }
  // Feed image — Meta accepts image_url without media_type.
  return { mediaType: null, useImageUrl: true, useVideoUrl: false, shareToFeed: false };
}

export async function createMediaContainer(params: {
  igUserId: string;
  accessToken: string;
  mediaKind: MediaKind;
  format: ContentFormat;
  mediaUrl: string;
  caption: string;
  /** When true, creates a carousel child item (no caption on child). */
  isCarouselItem?: boolean;
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
  if (params.isCarouselItem) {
    body.set('is_carousel_item', 'true');
  } else if (product.mediaType) {
    body.set('media_type', product.mediaType);
  }
  // Official Reels param — also surfaces the Reel on the profile feed when supported.
  if (!params.isCarouselItem && product.mediaType === 'REELS') {
    body.set('share_to_feed', 'true');
  }
  // Feed/Reels captions; Stories omit caption (not a feed caption field).
  // Carousel children never carry the feed caption — parent does.
  if (params.caption && !params.isCarouselItem && product.mediaType !== 'STORIES') {
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

/** Parent carousel container — children must already be FINISHED. */
export async function createCarouselContainer(params: {
  igUserId: string;
  accessToken: string;
  childContainerIds: string[];
  caption: string;
  fetchFn?: typeof fetch;
}): Promise<{ containerId: string }> {
  const fetchFn = params.fetchFn ?? fetch;
  if (params.childContainerIds.length < 2 || params.childContainerIds.length > 10) {
    throw new Error('carousel_child_count_invalid');
  }
  const body = new URLSearchParams();
  body.set('access_token', params.accessToken);
  body.set('media_type', 'CAROUSEL');
  body.set('children', params.childContainerIds.join(','));
  if (params.caption) body.set('caption', params.caption);

  const res = await fetchFn(graphUrl(`/${params.igUserId}/media`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(readGraphError(json, `carousel_container_${res.status}`));
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

/**
 * Poll Meta until the container is publishable.
 * Always used — including feed images (Meta may still return 9007/2207027 if rushed).
 */
export async function waitForContainerReady(params: {
  containerId: string;
  accessToken: string;
  fetchFn?: typeof fetch;
  mediaKind?: MediaKind;
  initialDelayMs?: number;
  intervalMs?: number;
  maxAttempts?: number;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<{ statusCode: ContainerStatusCode; attempts: number }> {
  const defaults = pollConfigForMedia(params.mediaKind ?? 'image');
  const initialDelayMs = params.initialDelayMs ?? defaults.initialDelayMs;
  const intervalMs = params.intervalMs ?? defaults.intervalMs;
  const maxAttempts = params.maxAttempts ?? defaults.maxAttempts;
  const sleepFn =
    params.sleepFn ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  if (initialDelayMs > 0) {
    await sleepFn(initialDelayMs);
  }

  for (let i = 0; i < maxAttempts; i++) {
    const { statusCode } = await getContainerStatus({
      containerId: params.containerId,
      accessToken: params.accessToken,
      fetchFn: params.fetchFn,
    });
    const readiness = classifyContainerStatus(statusCode);
    if (readiness === 'ready') {
      return { statusCode, attempts: i + 1 };
    }
    if (readiness === 'error') {
      throw new Error('container_error');
    }
    if (readiness === 'expired') {
      throw new Error('container_expired');
    }
    // pending (IN_PROGRESS or unknown) — wait and retry
    if (i < maxAttempts - 1) {
      await sleepFn(intervalMs);
    }
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

// ---- inline: _shared/instagram-publish/reelVideo.ts ----
/**
 * Official Instagram Reels video requirements (IG User Media Reel Specifications).
 * Used server-side before creating a Graph media container.
 */

export type ReelValidationCode =
  | 'ok'
  | 'missing_media'
  | 'unsupported_video_format'
  | 'video_file_too_large'
  | 'video_too_short'
  | 'video_too_long'
  | 'video_resolution_invalid'
  | 'video_aspect_invalid'
  | 'video_not_ready';

/** Meta Reel specs — Instagram Graph / IG User Media. */
export const IG_REEL_VIDEO_SPECS = {
  allowedMimeTypes: ['video/mp4', 'video/quicktime'] as const,
  maxBytes: 300 * 1024 * 1024,
  minDurationSec: 3,
  maxDurationSec: 15 * 60,
  maxWidthPx: 1920,
  minAspectRatio: 0.01,
  maxAspectRatio: 10,
} as const;

/**
 * Instagram Audio API requires Facebook Login (Meta changelog).
 * AscendOS uses Business Login for Instagram → not available without OAuth redesign.
 */
export const IG_OFFICIAL_AUDIO_CAPABILITY = {
  availableWithCurrentOAuth: false as const,
  currentLoginPath: 'instagram_business_login',
  requiredLoginPath: 'facebook_login_for_business',
  endpoints: ['GET /ig_audio', 'GET /{ig_audio_id}'] as const,
} as const;

export function isInstagramPublishableVideoMime(mime: string | null | undefined): boolean {
  const m = (mime ?? '').trim().toLowerCase();
  return (IG_REEL_VIDEO_SPECS.allowedMimeTypes as readonly string[]).includes(m);
}

export function validateReelAssetForPublish(input: {
  mediaKind: 'image' | 'video' | null | undefined;
  /** Draft format — Stories use a shorter Meta duration/size cap. */
  format?: 'story' | 'feed' | 'reel' | null;
  mimeType?: string | null;
  byteSize?: number | null;
  widthPx?: number | null;
  heightPx?: number | null;
  durationSec?: number | null;
  requireDuration?: boolean;
}): ReelValidationCode {
  if (!input.mediaKind) return 'missing_media';
  if (input.format === 'reel' && input.mediaKind !== 'video') return 'missing_media';
  if (input.mediaKind !== 'video') return 'ok';

  const mime = (input.mimeType ?? '').trim().toLowerCase();
  if (!mime || !isInstagramPublishableVideoMime(mime)) return 'unsupported_video_format';

  // Story video: 100 MB / 60 s (Meta Story Video Specifications).
  // Reels / feed video as REELS: 300 MB / 15 min (Meta Reel Specifications).
  const isStory = input.format === 'story';
  const maxBytes = isStory ? 100 * 1024 * 1024 : IG_REEL_VIDEO_SPECS.maxBytes;
  const maxDuration = isStory ? 60 : IG_REEL_VIDEO_SPECS.maxDurationSec;

  const bytes = input.byteSize ?? null;
  if (bytes != null && (bytes <= 0 || bytes > maxBytes)) {
    return 'video_file_too_large';
  }

  const w = input.widthPx ?? null;
  const h = input.heightPx ?? null;
  if (w != null && h != null && w > 0 && h > 0) {
    if (w > IG_REEL_VIDEO_SPECS.maxWidthPx) return 'video_resolution_invalid';
    const ratio = w / h;
    if (
      ratio < IG_REEL_VIDEO_SPECS.minAspectRatio ||
      ratio > IG_REEL_VIDEO_SPECS.maxAspectRatio
    ) {
      return 'video_aspect_invalid';
    }
  }

  const duration = input.durationSec;
  if (input.requireDuration && (duration == null || !Number.isFinite(duration))) {
    return 'video_not_ready';
  }
  if (duration != null && Number.isFinite(duration)) {
    if (duration < IG_REEL_VIDEO_SPECS.minDurationSec) return 'video_too_short';
    if (duration > maxDuration) return 'video_too_long';
  }

  return 'ok';
}

export function reelValidationErrorMessage(code: ReelValidationCode): string {
  switch (code) {
    case 'unsupported_video_format':
      return 'Videoformat nicht unterstützt. Instagram Reels benötigen MP4 (oder MOV).';
    case 'video_file_too_large':
      return 'Videodatei zu groß (max. 300 MB laut Meta).';
    case 'video_too_short':
      return 'Video zu kurz (mindestens 3 Sekunden laut Meta).';
    case 'video_too_long':
      return 'Video zu lang (maximal 15 Minuten laut Meta).';
    case 'video_resolution_invalid':
      return 'Videoauflösung nicht unterstützt (max. 1920 px Breite laut Meta).';
    case 'video_aspect_invalid':
      return 'Seitenverhältnis nicht unterstützt (zwischen 0,01:1 und 10:1 laut Meta).';
    case 'video_not_ready':
      return 'Video-Metadaten noch nicht bereit. Bitte kurz warten und erneut versuchen.';
    case 'missing_media':
      return 'Kein Medium ausgewählt.';
    default:
      return 'Video-Validierung fehlgeschlagen.';
  }
}

// ---- inline: _shared/instagram-publish/feedImageFit.ts ----
/**
 * Instagram Content Publishing — feed image aspect fit (official Meta range).
 * Docs: JPEG; aspect ratio within 4:5 … 1.91:1; width 320–1440.
 */

export const IG_FEED_IMAGE_SPECS = {
  /** Tallest allowed: 4:5 */
  minAspectRatio: 4 / 5,
  /** Widest allowed: 1.91:1 */
  maxAspectRatio: 1.91,
  minWidthPx: 320,
  maxWidthPx: 1440,
} as const;

export type FeedImageCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** True when width/height already fall inside Meta's feed aspect window. */
export function isFeedImageAspectAllowed(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false;
  }
  const ratio = width / height;
  return (
    ratio + 1e-9 >= IG_FEED_IMAGE_SPECS.minAspectRatio &&
    ratio - 1e-9 <= IG_FEED_IMAGE_SPECS.maxAspectRatio
  );
}

/**
 * Center-crop rectangle so the result ratio is within Meta's feed window.
 * If already valid, returns the full frame.
 */
export function computeFeedImageCrop(width: number, height: number): FeedImageCropRect {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const ratio = w / h;
  const { minAspectRatio, maxAspectRatio } = IG_FEED_IMAGE_SPECS;

  if (ratio < minAspectRatio) {
    // Too tall → crop height (keep width).
    const cropH = Math.max(1, Math.floor(w / minAspectRatio));
    const y = Math.max(0, Math.floor((h - cropH) / 2));
    return { x: 0, y, width: w, height: Math.min(cropH, h - y) };
  }

  if (ratio > maxAspectRatio) {
    // Too wide → crop width (keep height).
    const cropW = Math.max(1, Math.floor(h * maxAspectRatio));
    const x = Math.max(0, Math.floor((w - cropW) / 2));
    return { x, y: 0, width: Math.min(cropW, w - x), height: h };
  }

  return { x: 0, y: 0, width: w, height: h };
}

/** Target encode width after crop (Meta 320–1440; upscale tiny, downscale huge). */
export function feedImageEncodeWidth(croppedWidth: number): number {
  const w = Math.max(1, Math.floor(croppedWidth));
  if (w < IG_FEED_IMAGE_SPECS.minWidthPx) return IG_FEED_IMAGE_SPECS.minWidthPx;
  return Math.min(IG_FEED_IMAGE_SPECS.maxWidthPx, w);
}

/** Detect Meta error 2207009 / aspect-ratio rejection in sanitized messages. */
export function isMetaFeedImageAspectError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('aspect ratio') ||
    m.includes('seitenverhältnis') ||
    m.includes('2207009') ||
    (m.includes('valid aspect') && m.includes('image'))
  );
}

export const FEED_IMAGE_ASPECT_ERROR_MESSAGE =
  'Feed-Bilder brauchen ein Seitenverhältnis zwischen 4:5 und 1,91:1 (Instagram/Meta). Das Bild wurde angepasst bzw. bitte ein anderes Format wählen.';

// ---- inline: _shared/instagram-publish/index.ts ----


/**
 * content-autopilot-run — CRON_SECRET + service role.
 * Publishes due Instagram Autopilot slots. No Facebook. No browser timers.
 *
 * Auth: x-cron-secret / Bearer CRON_SECRET (same pattern as content-daily-prepare).
 */


const CONTENT_ASSETS_BUCKET = 'content-assets';

function authorizeCron(req: Request): Response | null {
  const expected = Deno.env.get('CRON_SECRET');
  if (!expected) return json({ ok: false, error: 'cron_secret_not_configured' }, 503);
  const header =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  if (!header || header !== expected) return json({ ok: false, error: 'unauthorized' }, 401);
  return null;
}

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function tokenSecret(): string {
  return (
    Deno.env.get('META_TOKEN_ENCRYPTION_KEY')?.trim() ||
    Deno.env.get('META_APP_SECRET')?.trim() ||
    ''
  );
}

async function prepareFeedImageUrlForMeta(params: {
  admin: SupabaseClient;
  sourceSignedUrl: string;
  orgId: string;
  slotId: string;
  mimeType: string | null | undefined;
}): Promise<string> {
  const res = await fetch(params.sourceSignedUrl);
  if (!res.ok) throw new Error('feed_image_fetch_failed');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const image = await Image.decode(bytes);
  const crop = computeFeedImageCrop(image.width, image.height);
  const needsCrop =
    crop.x !== 0 || crop.y !== 0 || crop.width !== image.width || crop.height !== image.height;
  const mime = (params.mimeType ?? '').toLowerCase();
  const needsJpeg = mime !== 'image/jpeg' && mime !== 'image/jpg';
  const targetW = feedImageEncodeWidth(crop.width);
  const needsResize = targetW !== crop.width;
  if (!needsCrop && !needsJpeg && !needsResize && isFeedImageAspectAllowed(image.width, image.height)) {
    return params.sourceSignedUrl;
  }
  let fitted = image;
  if (needsCrop) fitted = image.clone().crop(crop.x, crop.y, crop.width, crop.height);
  const encodeW = feedImageEncodeWidth(fitted.width);
  if (encodeW !== fitted.width) {
    const encodeH = Math.max(1, Math.round((fitted.height * encodeW) / fitted.width));
    fitted.resize(encodeW, encodeH);
  }
  const jpeg = await fitted.encodeJPEG(85);
  const path = `${params.orgId}/publish-fit/autopilot-${params.slotId}.jpg`;
  const { error: upErr } = await params.admin.storage.from(CONTENT_ASSETS_BUCKET).upload(path, jpeg, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (upErr) throw new Error('feed_image_fit_failed');
  const { data: fittedSigned, error: fitSignErr } = await params.admin.storage
    .from(CONTENT_ASSETS_BUCKET)
    .createSignedUrl(path, 7200);
  if (fitSignErr || !fittedSigned?.signedUrl) throw new Error('feed_image_fit_failed');
  return fittedSigned.signedUrl;
}

async function publishOneSlot(
  admin: SupabaseClient,
  slot: {
    id: string;
    org_id: string;
    membership_id: string;
    draft_id: string;
    asset_id: string | null;
    content_format: ContentFormat;
    retry_count: number;
    max_retries: number;
  }
): Promise<{ ok: boolean; status: string; error?: string; mediaId?: string }> {
  // Duplicate protection: already published attempt for this draft
  const { data: publishedRows } = await admin
    .from('content_publish_attempts')
    .select('id, meta_media_id')
    .eq('draft_id', slot.draft_id)
    .eq('status', 'published')
    .limit(1);
  if (publishedRows?.[0]?.meta_media_id) {
    await admin
      .from('content_autopilot_slots')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        publish_attempt_id: publishedRows[0].id,
        error_message: null,
      })
      .eq('id', slot.id);
    return { ok: true, status: 'published', mediaId: publishedRows[0].meta_media_id };
  }

  const { data: draft } = await admin
    .from('content_drafts')
    .select('id, org_id, owner_membership_id, asset_id, format, caption, cta, hashtags, status')
    .eq('id', slot.draft_id)
    .maybeSingle();
  if (!draft || draft.status !== 'ready') {
    return { ok: false, status: 'failed', error: 'draft_not_ready' };
  }

  const assetId = slot.asset_id ?? draft.asset_id;
  const { data: asset } = await admin
    .from('content_assets')
    .select('id, org_id, storage_path, media_kind, mime_type, byte_size, width_px, height_px')
    .eq('id', assetId)
    .maybeSingle();
  if (!asset?.storage_path) return { ok: false, status: 'failed', error: 'asset_not_found' };

  if (asset.media_kind === 'video' || draft.format === 'reel') {
    const videoCheck = validateReelAssetForPublish({
      mediaKind: asset.media_kind as MediaKind,
      format: draft.format as ContentFormat,
      mimeType: asset.mime_type,
      byteSize: asset.byte_size,
      widthPx: asset.width_px,
      heightPx: asset.height_px,
    });
    if (videoCheck !== 'ok') {
      return { ok: false, status: 'failed', error: String(videoCheck) };
    }
  }

  const caption = buildPublishCaption({
    caption: draft.caption,
    hashtags: draft.hashtags,
    cta: draft.cta,
  });
  if (!caption && draft.format !== 'story') {
    return { ok: false, status: 'failed', error: 'missing_caption' };
  }

  const { data: connection } = await admin
    .from('content_instagram_connections')
    .select('id, ig_user_id, ig_username, status, scopes, token_ref')
    .eq('org_id', slot.org_id)
    .eq('membership_id', slot.membership_id)
    .maybeSingle();
  if (!connection || connection.status !== 'connected' || !connection.ig_user_id || !connection.token_ref) {
    return { ok: false, status: 'failed', error: 'not_connected' };
  }
  if (!connectionHasPublishScope(connection.scopes)) {
    return { ok: false, status: 'failed', error: 'missing_publish_permission' };
  }

  const secret = tokenSecret();
  if (!secret) return { ok: false, status: 'failed', error: 'missing_token' };
  let accessToken: string;
  try {
    accessToken = await decryptToken(connection.token_ref, secret);
  } catch {
    return { ok: false, status: 'failed', error: 'token_decrypt_failed' };
  }

  const { data: attempt, error: attemptErr } = await admin
    .from('content_publish_attempts')
    .insert({
      org_id: slot.org_id,
      membership_id: slot.membership_id,
      draft_id: draft.id,
      connection_id: connection.id,
      status: 'queued',
      user_confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (attemptErr) {
    if (attemptErr.code === '23505') {
      return { ok: false, status: 'failed', error: 'already_in_progress' };
    }
    throw attemptErr;
  }

  try {
    const { data: signed, error: signErr } = await admin.storage
      .from(CONTENT_ASSETS_BUCKET)
      .createSignedUrl(asset.storage_path, 7200);
    if (signErr || !signed?.signedUrl) throw new Error('signed_url_failed');

    let mediaUrl = signed.signedUrl;
    if (asset.media_kind === 'image' && draft.format !== 'story' && draft.format !== 'reel') {
      mediaUrl = await prepareFeedImageUrlForMeta({
        admin,
        sourceSignedUrl: signed.signedUrl,
        orgId: slot.org_id,
        slotId: slot.id,
        mimeType: asset.mime_type,
      });
    }

    const created = await createMediaContainer({
      igUserId: connection.ig_user_id,
      accessToken,
      mediaKind: asset.media_kind as MediaKind,
      format: (slot.content_format || draft.format) as ContentFormat,
      mediaUrl,
      caption,
    });

    await admin
      .from('content_publish_attempts')
      .update({ status: 'submitted', meta_container_id: created.containerId })
      .eq('id', attempt.id);

    await waitForContainerReady({
      containerId: created.containerId,
      accessToken,
      mediaKind: asset.media_kind as MediaKind,
    });

    const published = await publishMediaContainer({
      igUserId: connection.ig_user_id,
      accessToken,
      containerId: created.containerId,
    });

    await admin
      .from('content_publish_attempts')
      .update({
        status: 'published',
        meta_container_id: created.containerId,
        meta_media_id: published.mediaId,
        error_message: null,
      })
      .eq('id', attempt.id);

    await admin
      .from('content_autopilot_slots')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        publish_attempt_id: attempt.id,
        error_message: null,
        performance_json: {
          meta_media_id: published.mediaId,
          captured_at: new Date().toISOString(),
          metrics: {},
          note: 'Snapshot stored at publish time. Insights filled only when Instagram Graph returns real metrics — never invented.',
        },
      })
      .eq('id', slot.id);

    // Best-effort Instagram Graph insights (Instagram-only; no Facebook APIs).
    try {
      const metrics = ['reach', 'likes', 'comments', 'saved', 'shares'];
      const insightUrl = new URL(`https://graph.instagram.com/v21.0/${published.mediaId}/insights`);
      insightUrl.searchParams.set('metric', metrics.join(','));
      insightUrl.searchParams.set('access_token', accessToken);
      const insightRes = await fetch(insightUrl);
      if (insightRes.ok) {
        const insightBody = (await insightRes.json()) as {
          data?: Array<{ name?: string; values?: Array<{ value?: number }> }>;
        };
        const metricsMap: Record<string, number> = {};
        for (const row of insightBody.data ?? []) {
          const name = row.name;
          const value = row.values?.[0]?.value;
          if (name && typeof value === 'number') metricsMap[name] = value;
        }
        if (Object.keys(metricsMap).length > 0) {
          await admin
            .from('content_autopilot_slots')
            .update({
              performance_json: {
                meta_media_id: published.mediaId,
                captured_at: new Date().toISOString(),
                metrics: metricsMap,
              },
            })
            .eq('id', slot.id);
        }
      }
    } catch {
      /* insights optional — never invent */
    }

    // Usage bump on successful publish
    if (asset.id) {
      const { data: usageRow } = await admin
        .from('content_assets')
        .select('usage_count')
        .eq('id', asset.id)
        .maybeSingle();
      await admin
        .from('content_assets')
        .update({
          last_used_at: new Date().toISOString(),
          usage_count: Number(usageRow?.usage_count ?? 0) + 1,
        })
        .eq('id', asset.id);
    }

    return { ok: true, status: 'published', mediaId: published.mediaId };
  } catch (e) {
    const msg = sanitizeMetaError(e instanceof Error ? e.message : 'publish_failed');
    const retries = slot.retry_count + 1;
    const giveUp = retries >= slot.max_retries;
    await admin
      .from('content_publish_attempts')
      .update({ status: 'failed', error_message: msg })
      .eq('id', attempt.id)
      .in('status', ['queued', 'submitted']);
    await admin
      .from('content_autopilot_slots')
      .update({
        status: giveUp ? 'failed' : 'ready',
        retry_count: retries,
        error_message: msg,
      })
      .eq('id', slot.id);
    if (isMetaFeedImageAspectError(msg)) {
      return { ok: false, status: 'failed', error: FEED_IMAGE_ASPECT_ERROR_MESSAGE };
    }
    return { ok: false, status: giveUp ? 'failed' : 'retry', error: msg };
  }
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const denied = authorizeCron(req);
  if (denied) return denied;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      limit?: number;
      membershipId?: string;
      force?: boolean;
    };
    const limit = Math.min(20, Math.max(1, Number(body.limit) || 5));
    const admin = adminClient();
    const now = new Date().toISOString();

    // Settings must be enabled + not paused
    let dueQuery = admin
      .from('content_autopilot_slots')
      .select(
        'id, org_id, membership_id, draft_id, asset_id, content_format, retry_count, max_retries, planned_for, status'
      )
      .in('status', ['ready', 'planned'])
      .lte('planned_for', now)
      .not('draft_id', 'is', null)
      .order('planned_for', { ascending: true })
      .limit(limit);

    if (body.membershipId) {
      dueQuery = dueQuery.eq('membership_id', body.membershipId);
    }

    const { data: dueSlots, error } = await dueQuery;
    if (error) throw error;

    const results: unknown[] = [];
    for (const raw of dueSlots ?? []) {
      const slot = raw as {
        id: string;
        org_id: string;
        membership_id: string;
        draft_id: string;
        asset_id: string | null;
        content_format: ContentFormat;
        retry_count: number;
        max_retries: number;
      };

      const { data: settings } = await admin
        .from('content_autopilot_settings')
        .select('enabled, paused')
        .eq('membership_id', slot.membership_id)
        .maybeSingle();
      if (!settings?.enabled || settings.paused) {
        results.push({ slotId: slot.id, status: 'skipped', reason: 'autopilot_paused_or_off' });
        continue;
      }

      // Claim publishing
      const { data: claimed } = await admin
        .from('content_autopilot_slots')
        .update({ status: 'publishing' })
        .eq('id', slot.id)
        .in('status', ['ready', 'planned'])
        .select('id')
        .maybeSingle();
      if (!claimed) {
        results.push({ slotId: slot.id, status: 'noop', reason: 'already_claimed' });
        continue;
      }

      const outcome = await publishOneSlot(admin, slot);
      results.push({ slotId: slot.id, ...outcome });
    }

    return json({
      ok: true,
      job: 'content-autopilot-run',
      processed: results.length,
      results,
      facebook: 'not_used',
    });
  } catch (e) {
    console.error('content_autopilot_run_error', e instanceof Error ? e.message : e);
    return json({ ok: false, error: 'internal_error' }, 500);
  }
});
