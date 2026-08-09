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
