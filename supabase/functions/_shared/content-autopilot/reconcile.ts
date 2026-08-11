/**
 * Dynamic plan reconciliation — replace invalid ready/planned slots only.
 * Never rewrite published history. Never full plan reset.
 */

import {
  isEligibleAutopilotAsset,
  isEligibleForSlotKind,
} from './eligibility.ts';
import { selectBestAutopilotAsset } from './selection.ts';
import { daypartFromHour, type WeekdayIndex } from './signals.ts';
import type {
  AutopilotEligibleAsset,
  AutopilotHistoryItem,
  AutopilotSlotKind,
} from './types.ts';

export type ReconcileSlotStatus =
  | 'planned'
  | 'ready'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export interface ReconcileSlotInput {
  id: string;
  status: ReconcileSlotStatus;
  slotKind: AutopilotSlotKind | string;
  assetId: string | null;
  carouselAssetIds: string[];
  plannedFor: string;
  category: string | null;
}

export type ReconcileDecision =
  | { action: 'keep' }
  | { action: 'ignore_published' }
  | { action: 'ignore_terminal' }
  | { action: 'replace'; reason: string }
  | { action: 'repair_carousel'; reason: string; keepPrimary: boolean };

/** Asset still usable for this slot kind? */
export function assetValidForSlot(
  asset: AutopilotEligibleAsset | null | undefined,
  slotKind: AutopilotSlotKind | string
): boolean {
  if (!asset) return false;
  if (!isEligibleAutopilotAsset(asset)) return false;
  if (slotKind === 'feed' || slotKind === 'story') {
    return isEligibleForSlotKind(asset, slotKind);
  }
  return false;
}

/**
 * Decide whether a slot needs reconciliation.
 * Published / publishing / failed / skipped / cancelled → leave alone (failed keeps retry path).
 */
export function decideSlotReconcile(params: {
  slot: ReconcileSlotInput;
  /** Map of currently existing assets by id (missing = deleted). */
  assetsById: ReadonlyMap<string, AutopilotEligibleAsset>;
}): ReconcileDecision {
  const { slot, assetsById } = params;
  if (slot.status === 'published') return { action: 'ignore_published' };
  if (slot.status === 'publishing') return { action: 'ignore_terminal' };
  if (slot.status === 'failed' || slot.status === 'skipped' || slot.status === 'cancelled') {
    return { action: 'ignore_terminal' };
  }
  if (slot.status !== 'planned' && slot.status !== 'ready') {
    return { action: 'ignore_terminal' };
  }

  const kind = (slot.slotKind === 'story' ? 'story' : 'feed') as AutopilotSlotKind;
  const primary = slot.assetId ? assetsById.get(slot.assetId) : null;

  if (!slot.assetId || !assetValidForSlot(primary, kind)) {
    return { action: 'replace', reason: 'asset_missing_or_ineligible' };
  }

  // Feed carousel: any missing/non-image child → repair (may shrink or replace)
  if (kind === 'feed' && slot.carouselAssetIds.length >= 2) {
    for (const id of slot.carouselAssetIds) {
      const a = assetsById.get(id);
      if (!assetValidForSlot(a, 'feed')) {
        return { action: 'repair_carousel', reason: 'carousel_child_invalid', keepPrimary: true };
      }
    }
  }

  // Video must never sit on a feed slot (defense in depth)
  if (kind === 'feed' && primary?.media_kind === 'video') {
    return { action: 'replace', reason: 'video_not_allowed_on_feed' };
  }

  return { action: 'keep' };
}

export function pickReplacementAsset(params: {
  slotKind: AutopilotSlotKind;
  plannedFor: string;
  assets: readonly AutopilotEligibleAsset[];
  reservedAssetIds: ReadonlySet<string>;
  history: readonly AutopilotHistoryItem[];
}): AutopilotEligibleAsset | null {
  const d = new Date(params.plannedFor);
  const weekday = d.getUTCDay() as WeekdayIndex;
  const hour = d.getUTCHours();
  void daypartFromHour(hour);
  const best = selectBestAutopilotAsset({
    assets: params.assets,
    slotKind: params.slotKind,
    weekday,
    hour,
    nowIso: params.plannedFor,
    reservedAssetIds: params.reservedAssetIds,
    history: params.history,
  });
  return best?.asset ?? null;
}

/** Filter carousel ids to still-valid images; drop dups; cap 10. */
export function repairCarouselAssetIds(params: {
  primaryId: string;
  carouselAssetIds: string[];
  assetsById: ReadonlyMap<string, AutopilotEligibleAsset>;
  max: number;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of [params.primaryId, ...params.carouselAssetIds]) {
    if (!id || seen.has(id)) continue;
    const a = params.assetsById.get(id);
    if (!assetValidForSlot(a, 'feed')) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= params.max) break;
  }
  return out;
}

/** Pure multi-slot plan: which slot ids need replace vs keep. */
export function planReconcileActions(params: {
  slots: readonly ReconcileSlotInput[];
  assetsById: ReadonlyMap<string, AutopilotEligibleAsset>;
}): Array<{ slotId: string; decision: ReconcileDecision }> {
  return params.slots.map((slot) => ({
    slotId: slot.id,
    decision: decideSlotReconcile({ slot, assetsById: params.assetsById }),
  }));
}
