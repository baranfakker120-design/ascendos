/** Official Facebook Login for Business HTTP helpers (Phase B — connect only). */

import { FB_MUSIC_CONNECT_SCOPES } from './types.ts';

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
