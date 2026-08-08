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
