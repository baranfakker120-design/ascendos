/**
 * Client mirror of Autopilot plan reconciliation decisions (unit-tested).
 * Source: supabase/functions/_shared/content-autopilot/reconcile.ts
 */

export type ReconcileSlotStatus =
  'planned' | 'ready' | 'publishing' | 'published' | 'failed' | 'skipped' | 'cancelled';

export interface ReconcileSlotInput {
  id: string;
  status: ReconcileSlotStatus;
  slotKind: 'feed' | 'story' | string;
  assetId: string | null;
  carouselAssetIds: string[];
  plannedFor: string;
}

export type ReconcileDecision =
  | { action: 'keep' }
  | { action: 'ignore_published' }
  | { action: 'ignore_terminal' }
  | { action: 'replace'; reason: string }
  | { action: 'repair_carousel'; reason: string; keepPrimary: boolean };

export function decideSlotReconcile(params: {
  slot: ReconcileSlotInput;
  /** Existing asset ids → media_kind */
  assets: ReadonlyMap<string, { media_kind: string }>;
}): ReconcileDecision {
  const { slot, assets } = params;
  if (slot.status === 'published') return { action: 'ignore_published' };
  if (slot.status === 'publishing') return { action: 'ignore_terminal' };
  if (slot.status === 'failed' || slot.status === 'skipped' || slot.status === 'cancelled') {
    return { action: 'ignore_terminal' };
  }
  if (slot.status !== 'planned' && slot.status !== 'ready') {
    return { action: 'ignore_terminal' };
  }

  const kind = slot.slotKind === 'story' ? 'story' : 'feed';
  const primary = slot.assetId ? assets.get(slot.assetId) : undefined;
  if (!slot.assetId || !primary) {
    return { action: 'replace', reason: 'asset_missing_or_ineligible' };
  }
  if (kind === 'feed' && primary.media_kind !== 'image') {
    return { action: 'replace', reason: 'video_not_allowed_on_feed' };
  }
  // AUTOPILOT HARD RULE: any multi-asset feed → collapse to single (never keep carousel).
  if (kind === 'feed' && slot.carouselAssetIds.length >= 2) {
    return {
      action: 'repair_carousel',
      reason: 'autopilot_collapse_to_single',
      keepPrimary: true,
    };
  }
  if (
    kind === 'feed' &&
    slot.carouselAssetIds.length >= 1 &&
    slot.carouselAssetIds.some((id) => id && id !== slot.assetId)
  ) {
    return {
      action: 'repair_carousel',
      reason: 'autopilot_collapse_to_single',
      keepPrimary: true,
    };
  }
  return { action: 'keep' };
}

/** Video may replace story only; feed replacement must be image. */
export function canReplaceSlotWith(params: {
  slotKind: 'feed' | 'story';
  candidateMediaKind: 'image' | 'video' | string;
}): boolean {
  if (params.slotKind === 'feed') return params.candidateMediaKind === 'image';
  return params.candidateMediaKind === 'image' || params.candidateMediaKind === 'video';
}

/** Uploading a new asset must not imply full plan reset. */
export function shouldResetPlanOnUpload(hasActiveValidPlan: boolean): boolean {
  void hasActiveValidPlan;
  return false;
}
