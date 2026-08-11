/**
 * Single pre-publish optimization pass for Autopilot feed/carousel.
 * Stories skipped. At most one vision generation per slot.
 */

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { generateDraftFromAssets } from '../content-generate/index.ts';
import type { AssetRow, MembershipRow } from '../content-generate/types.ts';
import {
  aggregatePerformanceContext,
  assessAutopilotOptimizeMode,
  buildTimingContext,
  extractAutopilotKeywords,
  lightlyTuneCaption,
  runAutopilotQualityCheck,
  selectExactFiveHashtags,
  shouldOptimizeAutopilotSlot,
  type AutopilotDraftSnapshot,
} from './optimize.ts';

export type OptimizeBeforePublishResult = {
  optimized: boolean;
  mode: string;
  qualityOk: boolean;
  notes: string[];
  visionUsed: boolean;
};

async function loadRecentHashtags(
  admin: SupabaseClient,
  membershipId: string
): Promise<string[]> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: slots } = await admin
    .from('content_autopilot_slots')
    .select('draft_id, published_at')
    .eq('membership_id', membershipId)
    .eq('status', 'published')
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(20);
  const draftIds = (slots ?? []).map((s) => s.draft_id).filter(Boolean) as string[];
  if (draftIds.length === 0) return [];
  const { data: drafts } = await admin
    .from('content_drafts')
    .select('hashtags')
    .in('id', draftIds);
  const out: string[] = [];
  for (const d of drafts ?? []) {
    for (const t of (d.hashtags as string[] | null) ?? []) out.push(String(t));
  }
  return out;
}

async function loadRecentCaptions(
  admin: SupabaseClient,
  membershipId: string
): Promise<string[]> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: slots } = await admin
    .from('content_autopilot_slots')
    .select('draft_id')
    .eq('membership_id', membershipId)
    .eq('status', 'published')
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(8);
  const draftIds = (slots ?? []).map((s) => s.draft_id).filter(Boolean) as string[];
  if (draftIds.length === 0) return [];
  const { data: drafts } = await admin.from('content_drafts').select('caption').in('id', draftIds);
  return (drafts ?? []).map((d) => String(d.caption ?? '')).filter(Boolean);
}

async function loadPerformanceRows(
  admin: SupabaseClient,
  membershipId: string
): Promise<Array<{ performance_json?: unknown }>> {
  const since = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from('content_autopilot_slots')
    .select('performance_json')
    .eq('membership_id', membershipId)
    .eq('status', 'published')
    .gte('published_at', since)
    .not('performance_json', 'is', null)
    .limit(30);
  return (data ?? []) as Array<{ performance_json?: unknown }>;
}

/**
 * Optimize draft in place. Max one vision call. Stories → no-op.
 */
export async function optimizeAutopilotDraftBeforePublish(params: {
  admin: SupabaseClient;
  membershipId: string;
  orgId: string;
  draftId: string;
  slotKind: string;
  contentFormat: string;
  plannedFor: string;
  assetIds: string[];
}): Promise<OptimizeBeforePublishResult> {
  if (
    !shouldOptimizeAutopilotSlot({
      slotKind: params.slotKind,
      contentFormat: params.contentFormat,
    })
  ) {
    return {
      optimized: false,
      mode: 'skip_story',
      qualityOk: true,
      notes: ['Stories skip content optimization.'],
      visionUsed: false,
    };
  }

  const { data: draft } = await params.admin
    .from('content_drafts')
    .select(
      'id, org_id, owner_membership_id, asset_id, carousel_asset_ids, format, hook, caption, cta, keywords, hashtags, analysis_json, status'
    )
    .eq('id', params.draftId)
    .maybeSingle();
  if (!draft) {
    return {
      optimized: false,
      mode: 'missing_draft',
      qualityOk: false,
      notes: ['Draft not found.'],
      visionUsed: false,
    };
  }

  const snapshot: AutopilotDraftSnapshot = {
    hook: draft.hook,
    caption: draft.caption,
    cta: draft.cta,
    keywords: draft.keywords,
    hashtags: draft.hashtags,
    format: draft.format,
    analysis_json: (draft.analysis_json as Record<string, unknown> | null) ?? null,
  };

  const mode = assessAutopilotOptimizeMode(snapshot);
  const timing = buildTimingContext(params.plannedFor);
  const performance = aggregatePerformanceContext(
    await loadPerformanceRows(params.admin, params.membershipId)
  );
  const recentHashtags = await loadRecentHashtags(params.admin, params.membershipId);
  const recentCaptions = await loadRecentCaptions(params.admin, params.membershipId);

  let hook = String(draft.hook ?? '');
  let caption = String(draft.caption ?? '');
  let cta = String(draft.cta ?? '');
  let keywords = extractAutopilotKeywords({
    theme: null,
    caption,
    analysisKeywords: Array.isArray(draft.keywords) ? draft.keywords.map(String) : [],
    analysisJson: (draft.analysis_json as Record<string, unknown>) ?? null,
  });
  let hashtags = Array.isArray(draft.hashtags) ? draft.hashtags.map(String) : [];
  let visionUsed = false;
  const notes: string[] = [`mode=${mode}`];
  if (performance?.hint) notes.push(`performance_hint=${performance.hint}`);
  notes.push(`timing=${timing.daypart}/weekday${timing.weekday}`);

  if (mode === 'refresh_copy') {
    try {
      const ids = params.assetIds.filter(Boolean).slice(0, 10);
      const { data: assets } = await params.admin
        .from('content_assets')
        .select(
          'id, org_id, owner_membership_id, scope, media_kind, mime_type, storage_path, file_name, title, theme, keywords, suggested_formats, aspect_ratio, analysis_status, analysis_json, detected_summary, audience_hint'
        )
        .in('id', ids);
      const ordered = ids
        .map((id) => (assets ?? []).find((a) => a.id === id))
        .filter(Boolean) as AssetRow[];
      if (ordered.length > 0) {
        const membership: MembershipRow = {
          id: params.membershipId,
          org_id: params.orgId,
          role: 'member',
          status: 'active',
        };
        const generated = await generateDraftFromAssets({
          db: params.admin,
          assets: ordered,
          membership,
          format: 'feed',
          locale: 'de',
          forcePersistAsset: false,
        });
        visionUsed = true;
        const g = generated.draft;
        hook = String(g.hook ?? hook);
        caption = String(g.caption ?? caption);
        cta = String(g.cta ?? cta);
        keywords = Array.isArray(g.keywords) ? g.keywords.map(String) : keywords;
        hashtags = Array.isArray(g.hashtags) ? g.hashtags.map(String) : hashtags;
        notes.push('vision_refresh_applied');
        // Soft-cancel the extra draft insert — keep publishing the original draft id
        if (g.id && g.id !== params.draftId) {
          await params.admin
            .from('content_drafts')
            .update({ status: 'archived', posting_hint: 'autopilot_opt_temp' })
            .eq('id', g.id);
        }
      }
    } catch (e) {
      notes.push(`vision_refresh_failed:${e instanceof Error ? e.message : 'error'}`);
    }
  }

  if (mode === 'reuse' || mode === 'hashtags_only' || mode === 'refresh_copy') {
    const tuned = lightlyTuneCaption({
      caption,
      hook,
      cta,
      timing,
      performance,
      recentCaptions,
    });
    caption = tuned.caption;
    hook = tuned.hook;
    cta = tuned.cta;
    if (tuned.changed) notes.push('light_caption_tune');

    const analysisHashtags = Array.isArray(
      (draft.analysis_json as Record<string, unknown> | null)?.hashtags
    )
      ? ((draft.analysis_json as Record<string, unknown>).hashtags as unknown[]).map(String)
      : [];
    const selected = selectExactFiveHashtags({
      theme: null,
      keywords,
      llmHashtags: [...hashtags, ...analysisHashtags],
      caption,
      contentCategory: null,
      recentHashtags,
    });
    hashtags = selected.hashtags;
    notes.push(...selected.notes.slice(0, 2));
  }

  let quality = runAutopilotQualityCheck({ hook, caption, cta, keywords, hashtags });
  // One correction attempt if quality fails (hashtag/catalog repair only — no second vision)
  if (!quality.ok) {
    const repaired = selectExactFiveHashtags({
      theme: null,
      keywords,
      llmHashtags: hashtags,
      caption,
      recentHashtags,
    });
    hashtags = repaired.hashtags;
    if (!cta.trim()) cta = 'Speichere diesen Beitrag für später.';
    if (!hook.trim() && caption) hook = caption.slice(0, 80);
    quality = runAutopilotQualityCheck({ hook, caption, cta, keywords, hashtags });
    notes.push('quality_repair_attempt');
  }

  await params.admin
    .from('content_drafts')
    .update({
      hook,
      caption,
      cta,
      keywords,
      hashtags,
      clean_check_status: quality.status,
      clean_check_notes: quality.notes.slice(0, 6).join(' | ') || 'ok',
      status: 'ready',
      analysis_json: {
        ...((draft.analysis_json as Record<string, unknown>) ?? {}),
        autopilot_optimization: {
          mode,
          timing,
          performance,
          visionUsed,
          qualityOk: quality.ok,
          notes: notes.slice(0, 8),
          optimized_at: new Date().toISOString(),
        },
      },
    })
    .eq('id', params.draftId);

  return {
    optimized: true,
    mode,
    qualityOk: quality.ok,
    notes,
    visionUsed,
  };
}
