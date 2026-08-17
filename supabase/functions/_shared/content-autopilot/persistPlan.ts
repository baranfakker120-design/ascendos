/**
 * Persist an Autopilot week plan (shared by user activate/replan + cron auto-continue).
 * Instagram-only. No Facebook.
 *
 * Drafts are lightweight placeholders; feed/carousel copy is optimized once
 * immediately before publish (see optimize.ts + content-autopilot-run).
 */

import {
  AUTOPILOT_MAX_FEED_PER_DAY,
  type AutopilotEligibleAsset,
  type AutopilotHistoryItem,
} from './types.ts';
import { resolveAutopilotSlotCaps, parseAutopilotPublishingMode } from './publishingMode.ts';
import { buildAutopilotWeekPlan } from './planner.ts';
import { selectExactFiveHashtags, extractAutopilotKeywords } from './optimize.ts';
import { pickSafePublicCopy } from '../content-generate/safeCopy.ts';

/** Minimal DB surface — avoids importing jsr types into the shared group. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AutopilotDb = any;

export interface AutopilotMembershipRef {
  id: string;
  org_id: string;
}

export async function createAutopilotDraftForSlot(
  db: AutopilotDb,
  membership: AutopilotMembershipRef,
  assetId: string,
  format: 'story' | 'feed' | 'reel',
  category: string,
  /** Ignored — Autopilot never persists carousel companions. */
  _carouselAssetIds: string[] = []
): Promise<string | null> {
  void _carouselAssetIds;
  // AUTOPILOT HARD RULE: never create carousel drafts (manual carousel is separate).

  // Reuse existing ready draft for same primary + format.
  {
    const { data: existing } = await db
      .from('content_drafts')
      .select('id, status, format')
      .eq('asset_id', assetId)
      .eq('owner_membership_id', membership.id)
      .eq('format', format)
      .in('status', ['draft', 'ready'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      if (existing.status !== 'ready') {
        await db.from('content_drafts').update({ status: 'ready' }).eq('id', existing.id);
      }
      return existing.id as string;
    }
  }

  const { data: asset } = await db
    .from('content_assets')
    .select(
      'id, title, theme, keywords, detected_summary, audience_hint, analysis_json, mime_type, media_kind'
    )
    .eq('id', assetId)
    .maybeSingle();
  if (!asset) return null;

  const analysis = (asset.analysis_json ?? {}) as Record<string, unknown>;
  // Never use asset title/filename as public copy — iPhone exports are often UUIDs.
  const hook =
    pickSafePublicCopy(
      typeof analysis.hook === 'string' ? analysis.hook : null,
      asset.theme ? String(asset.theme).slice(0, 120) : null
    ) ?? '';
  const caption =
    pickSafePublicCopy(
      typeof analysis.caption === 'string' ? analysis.caption : null,
      asset.detected_summary ? String(asset.detected_summary).slice(0, 1800) : null
    ) ?? '';
  const cta =
    pickSafePublicCopy(typeof analysis.cta === 'string' ? analysis.cta : null) ||
    (format === 'story' ? '' : '');

  const keywords = extractAutopilotKeywords({
    theme: asset.theme,
    caption: caption || null,
    analysisKeywords: Array.isArray(asset.keywords) ? asset.keywords.map(String) : [],
    analysisJson: analysis,
  });

  const llmHashtags = Array.isArray(analysis.hashtags)
    ? analysis.hashtags.map(String)
    : [];
  const { hashtags } = selectExactFiveHashtags({
    theme: asset.theme ? String(asset.theme) : null,
    keywords,
    llmHashtags,
    caption: caption || null,
    contentCategory: category,
  });

  const isPlaceholder = !hook.trim() || !caption.trim();

  const { data: draft, error } = await db
    .from('content_drafts')
    .insert({
      org_id: membership.org_id,
      asset_id: assetId,
      owner_membership_id: membership.id,
      format: format === 'reel' ? 'feed' : format,
      hook,
      caption: format === 'story' ? String(caption).slice(0, 400) : caption,
      cta,
      keywords,
      hashtags,
      clean_check_status: isPlaceholder ? 'attention' : 'clean',
      clean_check_notes: isPlaceholder
        ? 'Autopilot draft placeholder — awaiting KI optimization before publish.'
        : 'Autopilot draft placeholder — feed optimized before publish.',
      target_audience: asset.audience_hint,
      posting_hint: `Autopilot · ${category}`,
      status: 'ready',
      carousel_asset_ids: [],
      analysis_json: {
        source: 'autopilot_v1',
        category,
        reused_analysis: Boolean(analysis && Object.keys(analysis).length),
        is_carousel: false,
        optimization_pending: format !== 'story',
        placeholder: isPlaceholder,
      },
    })
    .select('id')
    .single();
  if (error) {
    console.error('autopilot_draft_insert_failed', error.message);
    return null;
  }
  return draft.id as string;
}

export async function buildAndInsertAutopilotPlan(
  db: AutopilotDb,
  membership: AutopilotMembershipRef,
  periodStart: string,
  periodEnd: string,
  assets: readonly AutopilotEligibleAsset[],
  history: readonly AutopilotHistoryItem[]
): Promise<{ planId: string; slotCount: number; skipped: number }> {
  const { data: settingsRow } = await db
    .from('content_autopilot_settings')
    .select('publishing_mode, max_feed_per_day, max_stories_per_day')
    .eq('org_id', membership.org_id)
    .eq('membership_id', membership.id)
    .maybeSingle();

  const caps = resolveAutopilotSlotCaps({
    publishingMode: settingsRow?.publishing_mode,
    maxFeedPerDay: settingsRow?.max_feed_per_day ?? AUTOPILOT_MAX_FEED_PER_DAY,
    maxStoriesPerDay: settingsRow?.max_stories_per_day,
  });

  const planned = buildAutopilotWeekPlan({
    periodStart,
    periodEnd,
    assets,
    history,
    maxFeedPerDay: caps.maxFeedPerDay,
    maxStoriesPerDay: caps.maxStoriesPerDay,
  });

  const { data: activePlans } = await db
    .from('content_autopilot_plans')
    .select('id')
    .eq('membership_id', membership.id)
    .eq('status', 'active');
  for (const p of activePlans ?? []) {
    await db
      .from('content_autopilot_slots')
      .update({ status: 'cancelled' })
      .eq('plan_id', p.id)
      .in('status', ['planned', 'ready', 'failed']);
    await db.from('content_autopilot_plans').update({ status: 'cancelled' }).eq('id', p.id);
  }

  const { data: plan, error: planErr } = await db
    .from('content_autopilot_plans')
    .insert({
      org_id: membership.org_id,
      membership_id: membership.id,
      period_start: periodStart,
      period_end: periodEnd,
      status: 'active',
      summary: `Autopilot ${periodStart} → ${periodEnd}`,
    })
    .select('id')
    .single();
  if (planErr) throw planErr;

  const slotPerformance = {
    publishing_mode: parseAutopilotPublishingMode(settingsRow?.publishing_mode),
    manual_publish_required: !caps.autoPublish,
  };

  let slotCount = 0;
  let skipped = 0;
  for (const s of planned) {
    if (s.status === 'skipped' || !s.assetId) {
      skipped += 1;
      await db.from('content_autopilot_slots').insert({
        org_id: membership.org_id,
        membership_id: membership.id,
        plan_id: plan.id,
        asset_id: null,
        carousel_asset_ids: [],
        planned_for: s.plannedFor,
        slot_kind: s.slotKind,
        content_format: s.contentFormat,
        theme: s.theme,
        category: s.category,
        selection_reason: s.selectionReason,
        status: 'skipped',
        error_message: s.skipReason ?? 'no_suitable_asset',
        performance_json: {
          ...slotPerformance,
          ...(s.skipDetail ? { skip_detail: s.skipDetail } : {}),
        },
      });
      continue;
    }

    // AUTOPILOT HARD RULE: feed slots persist exactly 1 asset; carousel_asset_ids always [].
    const draftId = await createAutopilotDraftForSlot(
      db,
      membership,
      s.assetId,
      s.contentFormat === 'reel' ? 'feed' : s.contentFormat,
      s.category,
      []
    );
    if (!draftId) {
      skipped += 1;
      await db.from('content_autopilot_slots').insert({
        org_id: membership.org_id,
        membership_id: membership.id,
        plan_id: plan.id,
        asset_id: s.assetId,
        carousel_asset_ids: [],
        planned_for: s.plannedFor,
        slot_kind: s.slotKind,
        content_format: s.contentFormat,
        theme: s.theme,
        category: s.category,
        selection_reason: s.selectionReason,
        status: 'skipped',
        error_message: 'draft_create_failed',
        performance_json: slotPerformance,
      });
      continue;
    }

    const { error: slotErr } = await db.from('content_autopilot_slots').insert({
      org_id: membership.org_id,
      membership_id: membership.id,
      plan_id: plan.id,
      draft_id: draftId,
      asset_id: s.assetId,
      carousel_asset_ids: [],
      planned_for: s.plannedFor,
      slot_kind: s.slotKind,
      content_format: s.contentFormat,
      theme: s.theme,
      category: s.category,
      selection_reason: s.selectionReason,
      status: 'ready',
      performance_json: slotPerformance,
    });
    if (slotErr) {
      skipped += 1;
      continue;
    }
    slotCount += 1;
  }

  return { planId: plan.id as string, slotCount, skipped };
}
