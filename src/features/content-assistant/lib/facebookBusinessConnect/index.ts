/**
 * Client mirrors for Facebook Login for Business (Phase B — Music connection).
 * Never handles tokens. Parallel to Instagram Login connect helpers.
 */

export type FbConnectionUiStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Minimum scopes mirrored from edge `FB_MUSIC_CONNECT_SCOPES` (includes Audio API publish scope). */
export const FB_MUSIC_CONNECT_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
] as const;

export interface SafeFacebookBusinessConnection {
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
  /** Server-computed: true only with valid Page + IG + scopes + encrypted page token. */
  instagramMusicAvailable: boolean;
}

export function dbStatusToUi(status: string | null | undefined): FbConnectionUiStatus {
  if (status === 'connected') return 'connected';
  if (status === 'error') return 'error';
  if (status === 'pending_review') return 'connecting';
  return 'disconnected';
}

export function parseFbCallbackParam(
  value: string | null
): 'connected' | 'cancelled' | 'denied' | 'error' | null {
  if (value === 'connected' || value === 'cancelled' || value === 'denied' || value === 'error') {
    return value;
  }
  return null;
}

export function hasRequiredMusicScopes(scopes: string[] | null | undefined): boolean {
  const set = new Set((scopes ?? []).map((s) => s.trim()).filter(Boolean));
  return (
    set.has('instagram_basic') && set.has('pages_show_list') && set.has('pages_read_engagement')
  );
}

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

export function toSafeFacebookBusinessConnection(
  raw: Record<string, unknown> | null | undefined
): SafeFacebookBusinessConnection {
  const statusRaw = typeof raw?.status === 'string' ? raw.status : undefined;
  const status =
    statusRaw === 'connecting' ||
    statusRaw === 'connected' ||
    statusRaw === 'disconnected' ||
    statusRaw === 'error'
      ? statusRaw
      : dbStatusToUi(statusRaw);

  const scopes = Array.isArray(raw?.scopes) ? raw.scopes.map(String) : [];
  const pageId = typeof raw?.pageId === 'string' ? raw.pageId : null;
  const igUserId = typeof raw?.igUserId === 'string' ? raw.igUserId : null;

  // Prefer server flag; never invent true from incomplete client data.
  const serverFlag =
    typeof raw?.instagramMusicAvailable === 'boolean' ? raw.instagramMusicAvailable : null;
  const instagramMusicAvailable =
    serverFlag === true
      ? resolveInstagramMusicAvailable({
          status: status === 'connected' ? 'connected' : status,
          pageId,
          igUserId,
          scopes,
          // Client never sees tokens — trust server true only after re-validating public fields.
          hasEncryptedPageToken: true,
        })
      : false;

  return {
    status,
    fbUserId: typeof raw?.fbUserId === 'string' ? raw.fbUserId : null,
    pageId,
    pageName: typeof raw?.pageName === 'string' ? raw.pageName : null,
    igUserId,
    igUsername: typeof raw?.igUsername === 'string' ? raw.igUsername : null,
    scopes,
    connectedAt: typeof raw?.connectedAt === 'string' ? raw.connectedAt : null,
    lastError: typeof raw?.lastError === 'string' ? raw.lastError : null,
    oauthConfigured: Boolean(raw?.oauthConfigured),
    instagramMusicAvailable,
  };
}

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

/**
 * Mirror of Edge authorize URL builder.
 * With `configId` (META_FACEBOOK_LOGIN_CONFIG_ID) Meta Configuration drives permissions;
 * `scope` is omitted. Without configId, falls back to FB_MUSIC_CONNECT_SCOPES.
 */
export function buildFacebookBusinessAuthorizeUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
  configId?: string | null;
  scopes?: readonly string[];
}): string {
  const redirectUri = normalizeRedirectUri(params.redirectUri);
  const configId = typeof params.configId === 'string' ? params.configId.trim() : '';
  const q = new URLSearchParams({
    client_id: params.appId,
    redirect_uri: redirectUri,
    state: params.state,
    response_type: 'code',
    display: 'page',
    extras: JSON.stringify({ setup: { channel: 'IG_API_ONBOARDING' } }),
  });
  if (configId) {
    q.set('config_id', configId);
  } else {
    q.set('scope', (params.scopes ?? FB_MUSIC_CONNECT_SCOPES).join(','));
  }
  return `https://www.facebook.com/v25.0/dialog/oauth?${q.toString()}`;
}

export function selectPageForConnection(params: {
  pages: Array<{ pageId: string; igUserId: string }>;
  preferredIgUserId?: string | null;
}): { pageId: string; igUserId: string } | null {
  if (!params.pages.length) return null;
  const preferred = params.preferredIgUserId?.trim();
  if (preferred) {
    const match = params.pages.find((p) => p.igUserId === preferred);
    if (match) return match;
  }
  return params.pages[0] ?? null;
}

/** Reject payloads that look like they contain tokens. */
export function assertNoTokenLeak(payload: unknown): boolean {
  const s = JSON.stringify(payload ?? {});
  if (/"token_ref"\s*:/.test(s)) return false;
  if (/"user_token_ref"\s*:/.test(s)) return false;
  if (/"page_token_ref"\s*:/.test(s)) return false;
  if (/"access_token"\s*:/.test(s)) return false;
  if (/"accessToken"\s*:/.test(s)) return false;
  if (/"pageAccessToken"\s*:/.test(s)) return false;
  if (/EAA[A-Za-z0-9]{20,}/.test(s)) return false;
  return true;
}
