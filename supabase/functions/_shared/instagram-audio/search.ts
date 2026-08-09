/** Official Meta Instagram Audio search helpers (Phase C). */

import {
  hasAudioSearchScopes,
  isInstagramAudioSearchType,
  missingAudioSearchScopes,
  type InstagramAudioSearchItem,
  type InstagramAudioSearchType,
} from './types.ts';

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
