// ============================================================
// content-assistant — Phase 3: AI asset analysis + draft generation
//
// Separate from coach-chat. Does NOT use coach quota.
// Does NOT publish to Instagram. Does NOT run daily cron.
// Shared generation core lives under content-generate.
// Vision: OpenRouter multimodal (Gemini) via signed media URL.
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleOptions, json } from '../_shared/cors.ts';
import {
  canPersistAssetAnalysis,
  CAROUSEL_MAX_ASSETS,
  countGenerationsToday,
  generateDraftFromAssets,
  markAssetAnalysisFailed,
  normalizeFormat,
  resolveDailyGenerationLimit,
  VisionFailureError,
  type AssetRow,
  type MembershipRow,
} from '../_shared/content-generate/index.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    // Forward org selector so current_org_id()/RLS resolve the same membership as the client.
    const forwardHeaders: Record<string, string> = {
      Authorization: req.headers.get('Authorization') ?? '',
    };
    const orgSelector = req.headers.get('x-ascendos-org');
    if (orgSelector) forwardHeaders['x-ascendos-org'] = orgSelector;

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: forwardHeaders },
    });

    const { data: userData, error: authError } = await db.auth.getUser();
    if (authError || !userData.user) return json({ error: 'not_authenticated' }, 401);

    const { data: memberships, error: membershipError } = await db
      .from('memberships')
      .select('id, org_id, role, status')
      .eq('identity_id', userData.user.id)
      .eq('status', 'active');
    if (membershipError) throw membershipError;

    const orgHeader = req.headers.get('x-ascendos-org');
    const active =
      (memberships as MembershipRow[] | null)?.find((m) => orgHeader && m.org_id === orgHeader) ??
      ((memberships as MembershipRow[] | null)?.length === 1
        ? (memberships as MembershipRow[])[0]
        : null);
    if (!active) return json({ error: 'no_active_membership' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'generate_draft');
    if (action !== 'generate_draft') {
      return json({ error: 'unsupported_action', action }, 400);
    }

    const assetIdsRaw = Array.isArray(body.assetIds)
      ? body.assetIds
      : body.assetId
        ? [body.assetId]
        : [];
    const assetIds = [
      ...new Set(
        assetIdsRaw
          .map((id: unknown) => String(id ?? '').trim())
          .filter((id: string) => Boolean(id))
      ),
    ].slice(0, CAROUSEL_MAX_ASSETS);
    if (assetIds.length === 0) return json({ error: 'asset_id_required' }, 400);

    const requestedFormat = normalizeFormat(body.format, 'feed');
    const locale = String(body.locale ?? 'de').trim().slice(0, 8) || 'de';

    const { data: assetsRaw, error: assetError } = await db
      .from('content_assets')
      .select(
        'id, org_id, owner_membership_id, scope, media_kind, storage_path, file_name, mime_type, title, aspect_ratio, suggested_formats'
      )
      .in('id', assetIds);
    if (assetError) throw assetError;
    const byId = new Map(
      ((assetsRaw as AssetRow[] | null) ?? []).map((a) => [a.id, a] as const)
    );
    const assetRows: AssetRow[] = [];
    for (const id of assetIds) {
      const row = byId.get(id);
      if (!row) return json({ error: 'asset_not_found' }, 404);
      if (row.org_id !== active.org_id) return json({ error: 'asset_wrong_org' }, 403);
      assetRows.push(row);
    }
    const assetRow = assetRows[0];

    // Content-side daily generation quota (org settings). Never coach quota.
    const { data: orgRow } = await db
      .from('organizations')
      .select('settings')
      .eq('id', active.org_id)
      .maybeSingle();
    const settings = (orgRow?.settings ?? {}) as Record<string, unknown>;
    const dailyLimit = resolveDailyGenerationLimit(settings);
    const usedToday = await countGenerationsToday(db, active.id);
    if (usedToday >= dailyLimit) {
      return json(
        {
          error: 'content_generation_quota_reached',
          used: usedToday,
          limit: dailyLimit,
          message: 'Content-Quota für KI-Generierungen heute erreicht.',
        },
        429
      );
    }

    const format =
      assetRows.length >= 2
        ? 'feed'
        : requestedFormat || normalizeFormat(assetRow.suggested_formats?.[0], 'feed');

    try {
      const result = await generateDraftFromAssets({
        db,
        assets: assetRows,
        membership: active,
        format,
        locale,
      });

      return json({
        ok: true,
        draft: result.draft,
        analysis: result.analysis,
        research: result.research,
        assetAnalysisPersisted: result.assetAnalysisPersisted,
        assetAnalysisMode: result.assetAnalysisMode,
        cleanCheck: result.cleanCheck,
        quota: {
          used: usedToday + 1,
          limit: dailyLimit,
        },
        // Phase 6 placeholder — never auto-publish.
        instagram: { prepareOnly: true, publishingEnabled: false },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const errorDetails = e instanceof VisionFailureError ? e.errorDetails : undefined;
      if (msg.startsWith('signed_url_failed')) {
        return json({ error: 'signed_url_failed', detail: 'signed_url_failed' }, 500);
      }
      if (msg === 'carousel_images_only') {
        return json({ error: 'carousel_images_only', detail: 'carousel_images_only' }, 422);
      }
      if (msg.includes('missing_openrouter_key') || msg.includes('OPENROUTER')) {
        return json({ error: 'ai_not_configured', detail: 'ai_not_configured' }, 503);
      }
      if (
        msg === 'VIDEO_FETCH_FAILED' ||
        msg === 'VIDEO_TOO_LARGE' ||
        msg === 'VIDEO_UNSUPPORTED_MIME' ||
        msg === 'AI_PROVIDER_BAD_REQUEST' ||
        msg === 'AI_PROVIDER_AUTH_ERROR' ||
        msg === 'AI_PROVIDER_RATE_LIMIT' ||
        msg === 'AI_PROVIDER_TIMEOUT' ||
        msg === 'AI_PROVIDER_CREDITS_EXHAUSTED' ||
        msg === 'AI_PROVIDER_ERROR'
      ) {
        if (canPersistAssetAnalysis(assetRow, active)) {
          await markAssetAnalysisFailed(db, assetRow, active, {
            error: msg,
            ...(errorDetails ? { error_details: errorDetails } : {}),
          });
        }
        const status =
          msg === 'VIDEO_TOO_LARGE' || msg === 'VIDEO_UNSUPPORTED_MIME'
            ? 422
            : msg === 'AI_PROVIDER_TIMEOUT'
              ? 504
              : msg === 'AI_PROVIDER_RATE_LIMIT'
                ? 429
                : msg === 'AI_PROVIDER_CREDITS_EXHAUSTED'
                  ? 402
                  : 502;
        return json(
          {
            error: msg,
            detail: msg,
            ...(errorDetails ? { error_details: errorDetails } : {}),
          },
          status
        );
      }
      if (
        msg.includes('invalid_ai_json') ||
        msg.includes('missing_visual_summary') ||
        msg.includes('missing_draft_fields') ||
        msg.includes('invalid_ai_public_copy')
      ) {
        await markAssetAnalysisFailed(db, assetRow, active, {
          error: 'parse_failed',
          detail: 'parse_failed',
        });
        return json({ error: 'ai_parse_failed', detail: 'parse_failed' }, 502);
      }
      if (canPersistAssetAnalysis(assetRow, active)) {
        await markAssetAnalysisFailed(db, assetRow, active, { error: 'ai_analysis_failed' });
      }
      return json({ error: 'ai_analysis_failed', detail: 'ai_analysis_failed' }, 502);
    }
  } catch (e) {
    console.error('content-assistant error', e);
    return json(
      {
        error: 'internal_error',
        detail: e instanceof Error ? e.message : String(e),
      },
      500
    );
  }
});
