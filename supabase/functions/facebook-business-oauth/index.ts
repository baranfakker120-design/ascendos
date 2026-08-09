/**
 * facebook-business-oauth — Phase B Facebook Login for Business (Music path).
 *
 * Parallel to instagram-oauth. Does NOT replace Instagram Login or publish.
 * Connect only — no Audio search, no audio_configuration, no music publish.
 *
 * Routes:
 * - POST { action: "start" | "disconnect" | "status" } + user JWT
 * - GET  ?code=&state=  (OAuth callback from Meta)
 * - GET  ?error=&state= (OAuth cancel / deny)
 *
 * Secrets (server only):
 * - META_APP_ID / META_APP_SECRET (shared Meta app)
 * - META_FACEBOOK_REDIRECT_URI (Valid OAuth Redirect URI for Facebook Login product)
 * - APP_ORIGIN / PUBLIC_APP_ORIGIN
 * - META_TOKEN_ENCRYPTION_KEY (optional; falls back to META_APP_SECRET)
 *
 * Non-secret env (Configuration ID is public Meta config, not a credential):
 * - META_FACEBOOK_LOGIN_CONFIG_ID (Facebook Login for Business → config_id on authorize URL)
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, json } from '../_shared/cors.ts';
import {
  appendOAuthDebug,
  buildFacebookBusinessAuthorizeUrl,
  dbStatusToUi,
  describeRedirectUri,
  encryptToken,
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  FB_MUSIC_CONNECT_SCOPES,
  fetchFacebookUserId,
  fetchInstagramBusinessProfile,
  fetchPagesWithInstagramBusiness,
  isOAuthUserCancel,
  normalizeOAuthCode,
  normalizeRedirectUri,
  randomNonce,
  resolveInstagramMusicAvailable,
  sanitizeMetaError,
  selectPageForConnection,
  signFbOAuthState,
  verifyFbOAuthState,
  type SafeFacebookBusinessConnectionView,
} from '../_shared/facebook-business-oauth/index.ts';

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
  /** Facebook Login for Business Configuration ID — not a secret. */
  loginConfigId: string;
}

function readMetaEnv(): MetaEnv | null {
  const appId = Deno.env.get('META_APP_ID')?.trim() ?? '';
  const appSecret = Deno.env.get('META_APP_SECRET')?.trim() ?? '';
  const redirectUri = normalizeRedirectUri(
    Deno.env.get('META_FACEBOOK_REDIRECT_URI') ?? Deno.env.get('FACEBOOK_BUSINESS_REDIRECT_URI') ?? ''
  );
  const appOrigin = (Deno.env.get('APP_ORIGIN') ?? Deno.env.get('PUBLIC_APP_ORIGIN') ?? '')
    .trim()
    .replace(/\/$/, '');
  // Configuration ID is public Meta config (not a credential); required for FB Login for Business.
  const loginConfigId = Deno.env.get('META_FACEBOOK_LOGIN_CONFIG_ID')?.trim() ?? '';
  if (!appId || !appSecret || !redirectUri || !appOrigin || !loginConfigId) return null;
  const tokenSecret = Deno.env.get('META_TOKEN_ENCRYPTION_KEY')?.trim() || appSecret;
  return { appId, appSecret, redirectUri, appOrigin, tokenSecret, loginConfigId };
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
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
  'id, org_id, membership_id, fb_user_id, page_id, page_name, ig_user_id, ig_username, status, scopes, last_error, connected_at, disconnected_at, page_token_ref, created_at, updated_at';

function toSafeView(row: Record<string, unknown> | null): SafeFacebookBusinessConnectionView {
  if (!row) {
    return {
      status: 'disconnected',
      fbUserId: null,
      pageId: null,
      pageName: null,
      igUserId: null,
      igUsername: null,
      scopes: [],
      connectedAt: null,
      lastError: null,
      oauthConfigured: oauthConfigured(),
      instagramMusicAvailable: false,
    };
  }
  const scopes = (row.scopes as string[]) ?? [];
  const hasEncryptedPageToken = typeof row.page_token_ref === 'string' && row.page_token_ref.length > 0;
  const status = String(row.status ?? 'disconnected');
  return {
    status: dbStatusToUi(status),
    fbUserId: (row.fb_user_id as string | null) ?? null,
    pageId: (row.page_id as string | null) ?? null,
    pageName: (row.page_name as string | null) ?? null,
    igUserId: (row.ig_user_id as string | null) ?? null,
    igUsername: (row.ig_username as string | null) ?? null,
    scopes,
    connectedAt: (row.connected_at as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    oauthConfigured: oauthConfigured(),
    instagramMusicAvailable: resolveInstagramMusicAvailable({
      status,
      pageId: row.page_id as string | null,
      igUserId: row.ig_user_id as string | null,
      scopes,
      hasEncryptedPageToken,
    }),
  };
}

async function loadSafeConnection(
  db: SupabaseClient,
  orgId: string,
  membershipId: string
): Promise<SafeFacebookBusinessConnectionView> {
  const { data, error } = await db
    .from('content_facebook_business_connections')
    .select(SAFE_COLS)
    .eq('org_id', orgId)
    .eq('membership_id', membershipId)
    .maybeSingle();
  if (error) throw error;
  // Strip token column before returning — never send token_ref to client.
  const view = toSafeView(data as Record<string, unknown> | null);
  return view;
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

async function fetchGrantedPermissions(params: {
  accessToken: string;
  fetchFn?: typeof fetch;
}): Promise<string[]> {
  const fetchFn = params.fetchFn ?? fetch;
  const q = new URLSearchParams({ access_token: params.accessToken });
  const res = await fetchFn(
    `https://graph.facebook.com/v25.0/me/permissions?${q.toString()}`
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return [...FB_MUSIC_CONNECT_SCOPES];
  const data = Array.isArray(json.data) ? json.data : [];
  const granted: string[] = [];
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    if (rec.status === 'granted' && typeof rec.permission === 'string') {
      granted.push(rec.permission);
    }
  }
  return granted.length ? granted : [...FB_MUSIC_CONNECT_SCOPES];
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const codeRaw = url.searchParams.get('code');
      const code = codeRaw ? normalizeOAuthCode(codeRaw) : null;
      const state = url.searchParams.get('state');
      const oauthError = url.searchParams.get('error');
      const meta = readMetaEnv();
      if (!meta) {
        return json({ error: 'facebook_business_oauth_not_configured' }, 503);
      }

      if (oauthError) {
        const payload = state ? await verifyFbOAuthState(state, meta.tokenSecret) : null;
        if (payload && isOAuthUserCancel(oauthError)) {
          const admin = adminClient();
          await admin.from('content_facebook_business_connections').upsert(
            {
              org_id: payload.oid,
              membership_id: payload.mid,
              status: 'disconnected',
              last_error: null,
              disconnected_at: new Date().toISOString(),
            },
            { onConflict: 'org_id,membership_id' }
          );
          return frontendRedirect(meta.appOrigin, { fb: 'cancelled' });
        }
        if (payload) {
          const admin = adminClient();
          await admin.from('content_facebook_business_connections').upsert(
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
          fb: isOAuthUserCancel(oauthError) ? 'cancelled' : 'denied',
        });
      }

      if (!code || !state) {
        return frontendRedirect(meta.appOrigin, { fb: 'error', reason: 'missing_code' });
      }

      const payload = await verifyFbOAuthState(state, meta.tokenSecret);
      if (!payload) {
        return frontendRedirect(meta.appOrigin, { fb: 'error', reason: 'invalid_state' });
      }

      const exchangeRedirectUri = normalizeRedirectUri(
        typeof payload.ruri === 'string' && payload.ruri ? payload.ruri : meta.redirectUri
      );
      const authDiag = describeRedirectUri(exchangeRedirectUri);
      const admin = adminClient();

      try {
        const short = await exchangeCodeForUserToken({
          appId: meta.appId,
          appSecret: meta.appSecret,
          redirectUri: exchangeRedirectUri,
          code,
        });
        const long = await exchangeForLongLivedUserToken({
          appId: meta.appId,
          appSecret: meta.appSecret,
          shortLivedToken: short.accessToken,
        });
        const fbUserId = await fetchFacebookUserId({ accessToken: long.accessToken });
        const scopes = await fetchGrantedPermissions({ accessToken: long.accessToken });
        const pages = await fetchPagesWithInstagramBusiness({
          userAccessToken: long.accessToken,
        });

        // Prefer matching the existing Instagram Login IG user when present.
        const { data: igConn } = await admin
          .from('content_instagram_connections')
          .select('ig_user_id')
          .eq('org_id', payload.oid)
          .eq('membership_id', payload.mid)
          .maybeSingle();

        const selected = selectPageForConnection({
          pages,
          preferredIgUserId: (igConn?.ig_user_id as string | null | undefined) ?? null,
        });
        if (!selected) {
          throw new Error('no_instagram_business_page');
        }

        const profile = await fetchInstagramBusinessProfile({
          igUserId: selected.igUserId,
          pageAccessToken: selected.pageAccessToken,
        });

        const userTokenRef = await encryptToken(long.accessToken, meta.tokenSecret);
        const pageTokenRef = await encryptToken(selected.pageAccessToken, meta.tokenSecret);
        const expiresAt =
          long.expiresIn > 0
            ? new Date(Date.now() + long.expiresIn * 1000).toISOString()
            : null;

        await admin.from('content_facebook_business_connections').upsert(
          {
            org_id: payload.oid,
            membership_id: payload.mid,
            fb_user_id: fbUserId,
            page_id: selected.pageId,
            page_name: selected.pageName || null,
            ig_user_id: profile.igUserId,
            ig_username: profile.username || null,
            status: 'connected',
            scopes,
            user_token_ref: userTokenRef,
            page_token_ref: pageTokenRef,
            token_expires_at: expiresAt,
            last_error: null,
            connected_at: new Date().toISOString(),
            disconnected_at: null,
          },
          { onConflict: 'org_id,membership_id' }
        );

        return frontendRedirect(meta.appOrigin, { fb: 'connected' });
      } catch (e) {
        const base = e instanceof Error ? e.message : 'oauth_failed';
        const msg = appendOAuthDebug(base, {
          redirect_uri: authDiag.redirectUri,
          len: authDiag.length,
          slash: authDiag.endsWithSlash ? 1 : 0,
          scheme: authDiag.scheme,
        });
        console.error('facebook_business_oauth_failed', {
          redirect_uri: authDiag.redirectUri,
          len: authDiag.length,
        });
        await admin.from('content_facebook_business_connections').upsert(
          {
            org_id: payload.oid,
            membership_id: payload.mid,
            status: 'error',
            last_error: msg,
            user_token_ref: null,
            page_token_ref: null,
          },
          { onConflict: 'org_id,membership_id' }
        );
        return frontendRedirect(meta.appOrigin, { fb: 'error', reason: 'token_exchange' });
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
      return json({ ok: true, connection });
    }

    if (action === 'start') {
      const meta = readMetaEnv();
      if (!meta) return json({ error: 'facebook_business_oauth_not_configured' }, 503);

      const returnOrigin = String(body.returnOrigin ?? meta.appOrigin).replace(/\/$/, '');
      if (!isAllowedOrigin(returnOrigin, meta.appOrigin)) {
        return json({ error: 'invalid_return_origin' }, 400);
      }

      const redirectUri = meta.redirectUri;
      const state = await signFbOAuthState(
        {
          kind: 'fb_business',
          mid: membership.id,
          oid: membership.org_id,
          nonce: randomNonce(),
          exp: Math.floor(Date.now() / 1000) + 600,
          ruri: redirectUri,
        },
        meta.tokenSecret
      );

      const admin = adminClient();
      await admin.from('content_facebook_business_connections').upsert(
        {
          org_id: membership.org_id,
          membership_id: membership.id,
          status: 'pending_review',
          last_error: null,
        },
        { onConflict: 'org_id,membership_id' }
      );

      const authorizeUrl = buildFacebookBusinessAuthorizeUrl({
        appId: meta.appId,
        redirectUri,
        state,
        configId: meta.loginConfigId,
      });

      const diag = describeRedirectUri(redirectUri);
      console.log('facebook_business_oauth_start', {
        redirect_uri: diag.redirectUri,
        len: diag.length,
        slash: diag.endsWithSlash,
        scheme: diag.scheme,
        config_id: meta.loginConfigId,
      });

      return json({
        ok: true,
        authorizeUrl,
        connection: await loadSafeConnection(db, membership.org_id, membership.id),
      });
    }

    if (action === 'disconnect') {
      const admin = adminClient();
      await admin
        .from('content_facebook_business_connections')
        .update({
          status: 'disconnected',
          user_token_ref: null,
          page_token_ref: null,
          fb_user_id: null,
          page_id: null,
          page_name: null,
          ig_user_id: null,
          ig_username: null,
          scopes: [],
          token_expires_at: null,
          last_error: null,
          disconnected_at: new Date().toISOString(),
        })
        .eq('org_id', membership.org_id)
        .eq('membership_id', membership.id);

      return json({
        ok: true,
        connection: await loadSafeConnection(db, membership.org_id, membership.id),
      });
    }

    return json({ error: 'unsupported_action', action }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'internal_error';
    return json({ error: 'internal_error', message: sanitizeMetaError(message) }, 500);
  }
});
