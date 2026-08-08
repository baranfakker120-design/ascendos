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
  countGenerationsToday,
  generateDraftFromAsset,
  markAssetAnalysisFailed,
  normalizeFormat,
  resolveDailyGenerationLimit,
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

    const assetId = String(body.assetId ?? '').trim();
    if (!assetId) return json({ error: 'asset_id_required' }, 400);

    const requestedFormat = normalizeFormat(body.format, 'feed');
    const locale = String(body.locale ?? 'de').trim().slice(0, 8) || 'de';

    const { data: asset, error: assetError } = await db
      .from('content_assets')
      .select(
        'id, org_id, owner_membership_id, scope, media_kind, storage_path, file_name, mime_type, title, aspect_ratio, suggested_formats'
      )
      .eq('id', assetId)
      .maybeSingle();
    if (assetError) throw assetError;
    if (!asset) return json({ error: 'asset_not_found' }, 404);
    const assetRow = asset as AssetRow;
    if (assetRow.org_id !== active.org_id) return json({ error: 'asset_wrong_org' }, 403);

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

    const format = requestedFormat || normalizeFormat(assetRow.suggested_formats?.[0], 'feed');

    try {
      const result = await generateDraftFromAsset({
        db,
        asset: assetRow,
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
      if (msg.startsWith('signed_url_failed')) {
        return json({ error: 'signed_url_failed', detail: msg }, 500);
      }
      if (msg.includes('missing_openrouter_key') || msg.includes('OPENROUTER')) {
        return json({ error: 'ai_not_configured', detail: msg }, 503);
      }
      if (
        msg.includes('invalid_ai_json') ||
        msg.includes('missing_visual_summary') ||
        msg.includes('missing_draft_fields')
      ) {
        await markAssetAnalysisFailed(db, assetRow, active, {
          error: 'parse_failed',
          detail: msg,
        });
        return json({ error: 'ai_parse_failed', detail: msg }, 502);
      }
      if (canPersistAssetAnalysis(assetRow, active)) {
        await markAssetAnalysisFailed(db, assetRow, active, { error: msg });
      }
      return json({ error: 'ai_analysis_failed', detail: msg }, 502);
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
