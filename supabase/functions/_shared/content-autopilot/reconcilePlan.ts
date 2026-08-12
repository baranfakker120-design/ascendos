/**
 * Server-side incremental plan reconciliation (used by content-autopilot-run).
 * Reuses existing selection / reservation rules. No frontend timers. No new cron.
 */

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { createAutopilotDraftForSlot } from './persistPlan.ts';
import {
  decideSlotReconcile,
  pickReplacementAsset,
  repairCarouselAssetIds,
  type ReconcileSlotInput,
} from './reconcile.ts';
import type { AutopilotEligibleAsset, AutopilotHistoryItem, AutopilotSlotKind } from './types.ts';

export type ReconcileRunSummary = {
  examined: number;
  kept: number;
  replaced: number;
  repairedCarousel: number;
  skippedNoReplacement: number;
  ignored: number;
};

function reservedFromSlots(
  slots: Array<{ id: string; asset_id: string | null; carousel_asset_ids: string[] | null; status: string }>
): Set<string> {
  const reserved = new Set<string>();
  for (const s of slots) {
    if (!['planned', 'ready', 'publishing'].includes(s.status)) continue;
    if (s.asset_id) reserved.add(s.asset_id);
    for (const id of s.carousel_asset_ids ?? []) if (id) reserved.add(id);
  }
  return reserved;
}

/**
 * Reconcile ready/planned slots for one membership's active plan.
 * Published slots untouched. Partial updates only.
 */
export async function reconcileActivePlanForMembership(params: {
  admin: SupabaseClient;
  orgId: string;
  membershipId: string;
  assets: readonly AutopilotEligibleAsset[];
  history: readonly AutopilotHistoryItem[];
}): Promise<ReconcileRunSummary> {
  const summary: ReconcileRunSummary = {
    examined: 0,
    kept: 0,
    replaced: 0,
    repairedCarousel: 0,
    skippedNoReplacement: 0,
    ignored: 0,
  };

  const { data: plan } = await params.admin
    .from('content_autopilot_plans')
    .select('id')
    .eq('membership_id', params.membershipId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan?.id) return summary;

  const { data: slotRows } = await params.admin
    .from('content_autopilot_slots')
    .select(
      'id, status, slot_kind, asset_id, carousel_asset_ids, planned_for, category, draft_id, content_format'
    )
    .eq('plan_id', plan.id)
    .order('planned_for', { ascending: true });

  const slots = slotRows ?? [];
  const assetsById = new Map(params.assets.map((a) => [a.id, a]));
  let reserved = reservedFromSlots(
    slots.map((s) => ({
      id: s.id,
      asset_id: s.asset_id,
      carousel_asset_ids: s.carousel_asset_ids,
      status: s.status,
    }))
  );

  for (const raw of slots) {
    summary.examined += 1;
    const slot: ReconcileSlotInput = {
      id: raw.id,
      status: raw.status,
      slotKind: raw.slot_kind,
      assetId: raw.asset_id,
      carouselAssetIds: (raw.carousel_asset_ids as string[] | null) ?? [],
      plannedFor: raw.planned_for,
      category: raw.category,
    };
    const decision = decideSlotReconcile({ slot, assetsById });

    if (decision.action === 'keep') {
      summary.kept += 1;
      continue;
    }
    if (
      decision.action === 'ignore_published' ||
      decision.action === 'ignore_terminal'
    ) {
      summary.ignored += 1;
      continue;
    }

    const kind = (slot.slotKind === 'story' ? 'story' : 'feed') as AutopilotSlotKind;

    if (decision.action === 'repair_carousel') {
      // AUTOPILOT HARD RULE: always collapse to primary single-image feed.
      // Never re-expand. Caption / hashtags / CTA on the draft are preserved
      // (draft update only clears carousel_asset_ids + may align asset_id).
      const repaired = repairCarouselAssetIds({
        primaryId: slot.assetId ?? '',
        carouselAssetIds: slot.carouselAssetIds,
        assetsById,
        max: 1,
      });
      if (repaired.length === 0) {
        // fall through to full replace
      } else {
        await params.admin
          .from('content_autopilot_slots')
          .update({
            asset_id: repaired[0],
            carousel_asset_ids: [],
            content_format: 'feed',
            selection_reason:
              'Autopilot Carousel → Single-Image Feed (Hard Rule: 1 Image only).',
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', slot.id)
          .in('status', ['planned', 'ready']);
        if (raw.draft_id) {
          // Preserve caption, hashtags, cta, hook — only clear carousel companions.
          await params.admin
            .from('content_drafts')
            .update({
              asset_id: repaired[0],
              carousel_asset_ids: [],
              status: 'ready',
            })
            .eq('id', raw.draft_id);
        }
        summary.repairedCarousel += 1;
        reserved = reservedFromSlots(
          (
            await params.admin
              .from('content_autopilot_slots')
              .select('id, asset_id, carousel_asset_ids, status')
              .eq('plan_id', plan.id)
          ).data ?? []
        );
        continue;
      }
    }

    // replace primary (and clear old reservation by swapping asset_id)
    if (slot.assetId) reserved.delete(slot.assetId);
    for (const id of slot.carouselAssetIds) reserved.delete(id);

    const replacement = pickReplacementAsset({
      slotKind: kind,
      plannedFor: slot.plannedFor,
      assets: params.assets,
      reservedAssetIds: reserved,
      history: params.history,
    });

    if (!replacement) {
      await params.admin
        .from('content_autopilot_slots')
        .update({
          status: 'skipped',
          asset_id: null,
          carousel_asset_ids: [],
          draft_id: null,
          error_message: 'reconcile_no_replacement',
          selection_reason: 'Asset missing — no eligible replacement available.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', slot.id)
        .in('status', ['planned', 'ready']);
      summary.skippedNoReplacement += 1;
      continue;
    }

    const draftId = await createAutopilotDraftForSlot(
      params.admin,
      { id: params.membershipId, org_id: params.orgId },
      replacement.id,
      kind === 'story' ? 'story' : 'feed',
      slot.category ?? 'general',
      []
    );

    const { error: updErr } = await params.admin
      .from('content_autopilot_slots')
      .update({
        asset_id: replacement.id,
        carousel_asset_ids: [],
        draft_id: draftId,
        content_format: kind === 'story' ? 'story' : 'feed',
        theme: replacement.theme,
        selection_reason: 'Slot reconciled — asset replaced after delete/ineligible.',
        error_message: null,
        status: 'ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', slot.id)
      .in('status', ['planned', 'ready']);

    if (updErr) {
      // Unique reservation conflict — leave for next cron tick
      reserved.add(replacement.id);
      summary.skippedNoReplacement += 1;
      continue;
    }

    reserved.add(replacement.id);
    summary.replaced += 1;
  }

  return summary;
}
