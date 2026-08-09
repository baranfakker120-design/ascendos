/**
 * instagram-audio-search — Phase C Instagram Audio API search.
 *
 * Uses encrypted tokens from content_facebook_business_connections (Facebook Login).
 * Does NOT touch instagram-oauth, instagram-publish, or audio_configuration.
 *
 * POST { action: "search", audioType: "music"|"original_sound", searchQuery?: string }
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, json } from '../_shared/cors.ts';
import { decryptToken } from '../_shared/facebook-business-oauth/state.ts';
import {
  assertAudioSearchConnection,
  isInstagramAudioSearchType,
  sanitizeAudioMetaError,
  searchInstagramAudio,
} from '../_shared/instagram-audio/index.ts';

interface MembershipRow {
  id: string;
  org_id: string;
  role: string;
  status: string;
}

interface FbConnectionRow {
  status: string;
  ig_user_id: string | null;
  scopes: string[] | null;
  user_token_ref: string | null;
  page_token_ref: string | null;
}

function tokenSecret(): string {
  return (
    Deno.env.get('META_TOKEN_ENCRYPTION_KEY')?.trim() ||
    Deno.env.get('META_APP_SECRET')?.trim() ||
    ''
  );
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
): Promise<{ membership: MembershipRow } | Response> {
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
  return { membership: active };
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const db = userClient(req);
    const resolved = await resolveMembership(db, req);
    if (resolved instanceof Response) return resolved;
    const { membership } = resolved;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'search');
    if (action !== 'search') {
      return json({ error: 'unsupported_action', action }, 400);
    }

    const audioTypeRaw = body.audioType ?? body.audio_type;
    if (!isInstagramAudioSearchType(audioTypeRaw)) {
      return json({ error: 'invalid_audio_type' }, 400);
    }

    const searchQuery =
      typeof body.searchQuery === 'string'
        ? body.searchQuery
        : typeof body.search_query === 'string'
          ? body.search_query
          : null;

    // Load FB connection via service role so token_ref columns are readable server-side only.
    const admin = adminClient();
    const { data: conn, error: connError } = await admin
      .from('content_facebook_business_connections')
      .select('status, ig_user_id, scopes, user_token_ref, page_token_ref')
      .eq('org_id', membership.org_id)
      .eq('membership_id', membership.id)
      .maybeSingle();
    if (connError) throw connError;

    const row = (conn as FbConnectionRow | null) ?? null;
    const gate = assertAudioSearchConnection({
      status: row?.status,
      igUserId: row?.ig_user_id,
      scopes: row?.scopes ?? [],
      hasUserToken: Boolean(row?.user_token_ref),
    });
    if (!gate.ok) {
      const status =
        gate.error === 'facebook_connection_missing'
          ? 409
          : gate.error === 'missing_permission'
            ? 403
            : 409;
      return json(
        {
          error: gate.error,
          missingScopes: gate.missingScopes ?? [],
          audioSearchAvailable: false,
        },
        status
      );
    }

    const secret = tokenSecret();
    if (!secret || !row?.user_token_ref) {
      return json({ error: 'facebook_connection_invalid', audioSearchAvailable: false }, 409);
    }

    let accessToken: string;
    try {
      accessToken = await decryptToken(row.user_token_ref, secret);
    } catch {
      return json({ error: 'facebook_connection_invalid', audioSearchAvailable: false }, 409);
    }

    try {
      const result = await searchInstagramAudio({
        accessToken,
        igUserId: gate.igUserId,
        audioType: audioTypeRaw,
        searchQuery,
      });
      // Never include tokens in the response.
      return json({
        ok: true,
        audioType: audioTypeRaw,
        searchQuery: typeof searchQuery === 'string' ? searchQuery.trim().slice(0, 100) : null,
        audio: result.audio,
        audioSearchAvailable: true,
      });
    } catch (e) {
      const err = e as Error & { code?: string };
      const code = err.code === 'missing_permission' ? 'missing_permission' : 'meta_api_error';
      const status = code === 'missing_permission' ? 403 : 502;
      return json(
        {
          error: code,
          message: sanitizeAudioMetaError(err.message || 'meta_api_error'),
          audioSearchAvailable: code !== 'missing_permission',
        },
        status
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'internal_error';
    return json({ error: 'internal_error', message: sanitizeAudioMetaError(message) }, 500);
  }
});
