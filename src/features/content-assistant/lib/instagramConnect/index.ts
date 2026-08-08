/** Client-side mirrors of Instagram connect helpers (Phase 5A). */

export type IgConnectionUiStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SafeInstagramConnection {
  status: IgConnectionUiStatus;
  igUserId: string | null;
  igUsername: string | null;
  scopes: string[];
  connectedAt: string | null;
  lastError: string | null;
  oauthConfigured: boolean;
}

export function dbStatusToUi(status: string | null | undefined): IgConnectionUiStatus {
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

/** Map ?ig= query from OAuth callback redirect. */
export function parseIgCallbackParam(
  value: string | null
): 'connected' | 'cancelled' | 'denied' | 'error' | null {
  if (value === 'connected' || value === 'cancelled' || value === 'denied' || value === 'error') {
    return value;
  }
  return null;
}

/** Ensure client never keeps token-like fields from a loose API payload. */
export function toSafeConnection(
  raw: Record<string, unknown> | null | undefined
): SafeInstagramConnection {
  const status = dbStatusToUi(typeof raw?.status === 'string' ? raw.status : undefined);
  // If API already returned UI status:
  const ui =
    raw?.status === 'connecting' ||
    raw?.status === 'connected' ||
    raw?.status === 'disconnected' ||
    raw?.status === 'error'
      ? (raw.status as IgConnectionUiStatus)
      : status;

  return {
    status: ui,
    igUserId: typeof raw?.igUserId === 'string' ? raw.igUserId : null,
    igUsername: typeof raw?.igUsername === 'string' ? raw.igUsername : null,
    scopes: Array.isArray(raw?.scopes) ? raw.scopes.map(String) : [],
    connectedAt: typeof raw?.connectedAt === 'string' ? raw.connectedAt : null,
    lastError: typeof raw?.lastError === 'string' ? raw.lastError : null,
    oauthConfigured: Boolean(raw?.oauthConfigured),
  };
}

/** Keep in sync with edge `normalizeRedirectUri`. */
export function normalizeRedirectUri(raw: string): string {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  if (value.length > 1 && value.endsWith('/')) {
    value = value.slice(0, -1);
  }
  return value;
}

/** Keep in sync with edge `normalizeOAuthCode`. */
export function normalizeOAuthCode(raw: string): string {
  return raw.trim().split('#')[0]!.trim();
}

export function buildAuthorizeUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
  scopes?: string[];
}): string {
  const scope = (params.scopes ?? ['instagram_business_basic']).join(',');
  const redirectUri = normalizeRedirectUri(params.redirectUri);
  const q = new URLSearchParams({
    client_id: params.appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state: params.state,
  });
  return `https://www.instagram.com/oauth/authorize?${q.toString()}`;
}

export function assertNoTokenLeak(payload: unknown): boolean {
  const s = JSON.stringify(payload ?? {});
  if (/"token_ref"\s*:/.test(s)) return false;
  if (/"access_token"\s*:/.test(s)) return false;
  if (/"accessToken"\s*:/.test(s)) return false;
  if (/EAA[A-Za-z0-9]{20,}/.test(s)) return false;
  return true;
}
