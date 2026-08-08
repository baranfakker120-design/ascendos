/**
 * instagram-oauth — Phase 5A Instagram Professional account connection.
 *
 * Official Meta Business Login for Instagram only.
 * Connect only — no publishing, no content_publish_attempts, no Graph publish calls.
 *
 * Routes:
 * - POST { action: "start" | "disconnect" | "status" } + user JWT
 * - GET  ?code=&state=  (OAuth callback from Meta)
 * - GET  ?error=&state= (OAuth cancel / deny)
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, json } from '../_shared/cors.ts';
import {
  buildAuthorizeUrl,
  dbStatusToUi,
  encryptToken,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchIgProfile,
  IG_CONNECT_SCOPES,
  isOAuthUserCancel,
  randomNonce,
  sanitizeMetaError,
  signOAuthState,
  verifyOAuthState,
  type SafeConnectionView,
} from '../_shared/instagram-oauth/index.ts';

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
}

function readMetaEnv(): MetaEnv | null {
  const appId = Deno.env.get('META_APP_ID')?.trim() ?? '';
  const appSecret = Deno.env.get('META_APP_SECRET')?.trim() ?? '';
  const redirectUri = Deno.env.get('META_REDIRECT_URI')?.trim() ?? '';
  const appOrigin = (Deno.env.get('APP_ORIGIN') ?? Deno.env.get('PUBLIC_APP_ORIGIN') ?? '')
    .trim()
    .replace(/\/$/, '');
  if (!appId || !appSecret || !redirectUri || !appOrigin) return null;
  const tokenSecret =
    Deno.env.get('META_TOKEN_ENCRYPTION_KEY')?.trim() ||
    appSecret; /* fallback: encrypt with app secret */
  return { appId, appSecret, redirectUri, appOrigin, tokenSecret };
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
  'id, org_id, membership_id, ig_user_id, ig_username, status, scopes, last_error, connected_at, disconnected_at, created_at, updated_at';

async function loadSafeConnection(
  db: SupabaseClient,
  orgId: string,
  membershipId: string
): Promise<SafeConnectionView> {
  const { data, error } = await db
    .from('content_instagram_connections')
    .select(SAFE_COLS)
    .eq('org_id', orgId)
    .eq('membership_id', membershipId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      status: 'disconnected',
      igUserId: null,
      igUsername: null,
      scopes: [],
      connectedAt: null,
      lastError: null,
      oauthConfigured: oauthConfigured(),
    };
  }
  return {
    status: dbStatusToUi(data.status),
    igUserId: data.ig_user_id ?? null,
    igUsername: data.ig_username ?? null,
    scopes: (data.scopes as string[]) ?? [],
    connectedAt: data.connected_at ?? null,
    lastError: data.last_error ?? null,
    oauthConfigured: oauthConfigured(),
  };
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

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const url = new URL(req.url);

    // ---- OAuth callback (GET from Meta) ----
    if (req.method === 'GET') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const oauthError = url.searchParams.get('error');
      const meta = readMetaEnv();
      if (!meta) {
        return json({ error: 'instagram_oauth_not_configured' }, 503);
      }

      if (oauthError) {
        const payload = state ? await verifyOAuthState(state, meta.tokenSecret) : null;
        if (payload && isOAuthUserCancel(oauthError)) {
          const admin = adminClient();
          await admin
            .from('content_instagram_connections')
            .upsert(
              {
                org_id: payload.oid,
                membership_id: payload.mid,
                status: 'disconnected',
                last_error: null,
                disconnected_at: new Date().toISOString(),
              },
              { onConflict: 'org_id,membership_id' }
            );
          return frontendRedirect(meta.appOrigin, { ig: 'cancelled' });
        }
        if (payload) {
          const admin = adminClient();
          await admin
            .from('content_instagram_connections')
            .upsert(
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
          ig: isOAuthUserCancel(oauthError) ? 'cancelled' : 'denied',
        });
      }

      if (!code || !state) {
        return frontendRedirect(meta.appOrigin, { ig: 'error', reason: 'missing_code' });
      }

      const payload = await verifyOAuthState(state, meta.tokenSecret);
      if (!payload) {
        return frontendRedirect(meta.appOrigin, { ig: 'error', reason: 'invalid_state' });
      }

      const admin = adminClient();
      try {
        const short = await exchangeCodeForShortLivedToken({
          appId: meta.appId,
          appSecret: meta.appSecret,
          redirectUri: meta.redirectUri,
          code,
        });
        const long = await exchangeForLongLivedToken({
          appSecret: meta.appSecret,
          shortLivedToken: short.accessToken,
        });
        const profile = await fetchIgProfile({ accessToken: long.accessToken });
        const tokenRef = await encryptToken(long.accessToken, meta.tokenSecret);

        await admin.from('content_instagram_connections').upsert(
          {
            org_id: payload.oid,
            membership_id: payload.mid,
            ig_user_id: profile.userId,
            ig_username: profile.username,
            status: 'connected',
            scopes: short.permissions.length ? short.permissions : [...IG_CONNECT_SCOPES],
            token_ref: tokenRef,
            last_error: null,
            connected_at: new Date().toISOString(),
            disconnected_at: null,
          },
          { onConflict: 'org_id,membership_id' }
        );

        // Ensure we never return tokens — redirect only.
        return frontendRedirect(meta.appOrigin, { ig: 'connected' });
      } catch (e) {
        const msg = sanitizeMetaError(e instanceof Error ? e.message : 'oauth_failed');
        await admin.from('content_instagram_connections').upsert(
          {
            org_id: payload.oid,
            membership_id: payload.mid,
            status: 'error',
            last_error: msg,
            token_ref: null,
          },
          { onConflict: 'org_id,membership_id' }
        );
        return frontendRedirect(meta.appOrigin, { ig: 'error', reason: 'token_exchange' });
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
      return json({ ok: true, connection, publishingEnabled: false });
    }

    if (action === 'start') {
      const meta = readMetaEnv();
      if (!meta) return json({ error: 'instagram_oauth_not_configured' }, 503);

      // Optional client-supplied return origin must match configured APP_ORIGIN.
      const returnOrigin = String(body.returnOrigin ?? meta.appOrigin).replace(/\/$/, '');
      if (!isAllowedOrigin(returnOrigin, meta.appOrigin)) {
        return json({ error: 'invalid_return_origin' }, 400);
      }

      const state = await signOAuthState(
        {
          mid: membership.id,
          oid: membership.org_id,
          nonce: randomNonce(),
          exp: Math.floor(Date.now() / 1000) + 600,
        },
        meta.tokenSecret
      );

      const admin = adminClient();
      await admin.from('content_instagram_connections').upsert(
        {
          org_id: membership.org_id,
          membership_id: membership.id,
          status: 'pending_review',
          last_error: null,
        },
        { onConflict: 'org_id,membership_id' }
      );

      const authorizeUrl = buildAuthorizeUrl({
        appId: meta.appId,
        redirectUri: meta.redirectUri,
        state,
      });

      return json({
        ok: true,
        authorizeUrl,
        connection: await loadSafeConnection(db, membership.org_id, membership.id),
        publishingEnabled: false,
      });
    }

    if (action === 'disconnect') {
      const admin = adminClient();
      // Clear encrypted token; never return it.
      await admin
        .from('content_instagram_connections')
        .update({
          status: 'disconnected',
          token_ref: null,
          ig_user_id: null,
          ig_username: null,
          scopes: [],
          last_error: null,
          disconnected_at: new Date().toISOString(),
        })
        .eq('org_id', membership.org_id)
        .eq('membership_id', membership.id);

      return json({
        ok: true,
        connection: await loadSafeConnection(db, membership.org_id, membership.id),
        publishingEnabled: false,
      });
    }

    return json({ error: 'unsupported_action', action }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'internal_error';
    return json({ error: 'internal_error', message: sanitizeMetaError(message) }, 500);
  }
});
