/** Official Meta / Instagram Login HTTP helpers (Phase 5A connect only). */

import { IG_CONNECT_SCOPES } from './types.ts';

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
