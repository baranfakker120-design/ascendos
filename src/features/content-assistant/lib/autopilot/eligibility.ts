/** Client mirror of autopilot eligibility / constants (unit-tested). */

export const AUTOPILOT_MIN_ELIGIBLE_ASSETS = 10;
export const AUTOPILOT_MAX_FEED_PER_DAY = 3;
export const AUTOPILOT_MAX_STORIES_PER_DAY = 3;

export interface AutopilotEligibleAsset {
  id: string;
  scope: string;
  media_kind: string;
  mime_type: string | null;
  storage_path: string | null;
  analysis_status: string | null;
}

/** Gate pool: images + videos. */
export function isEligibleAutopilotAsset(asset: AutopilotEligibleAsset): boolean {
  if (!asset?.id) return false;
  if (!asset.storage_path?.trim()) return false;
  if (asset.media_kind !== 'image' && asset.media_kind !== 'video') return false;
  if (asset.analysis_status === 'failed') return false;
  return true;
}

/** Feed/Carousel pool: images only. */
export function isEligibleAutopilotFeedAsset(asset: AutopilotEligibleAsset): boolean {
  return isEligibleAutopilotAsset(asset) && asset.media_kind === 'image';
}

/** Story pool: image or video. */
export function isEligibleAutopilotStoryAsset(asset: AutopilotEligibleAsset): boolean {
  return isEligibleAutopilotAsset(asset);
}

export function isEligibleForSlotKind(
  asset: AutopilotEligibleAsset,
  slotKind: 'feed' | 'story'
): boolean {
  return slotKind === 'feed'
    ? isEligibleAutopilotFeedAsset(asset)
    : isEligibleAutopilotStoryAsset(asset);
}

export function countEligibleAssets(assets: readonly AutopilotEligibleAsset[]): number {
  return assets.filter(isEligibleAutopilotAsset).length;
}

export function countEligibleFeedAssets(assets: readonly AutopilotEligibleAsset[]): number {
  return assets.filter(isEligibleAutopilotFeedAsset).length;
}

export function canActivateAutopilot(
  assets: readonly AutopilotEligibleAsset[],
  minRequired = AUTOPILOT_MIN_ELIGIBLE_ASSETS
): { ok: true; count: number } | { ok: false; count: number; reason: 'below_min_assets' } {
  const count = countEligibleAssets(assets);
  if (count < minRequired) return { ok: false, count, reason: 'below_min_assets' };
  return { ok: true, count };
}

export function countByScope(assets: readonly AutopilotEligibleAsset[]): {
  personal: number;
  central: number;
  total: number;
} {
  let personal = 0;
  let central = 0;
  for (const a of assets) {
    if (!isEligibleAutopilotAsset(a)) continue;
    if (a.scope === 'central') central += 1;
    else personal += 1;
  }
  return { personal, central, total: personal + central };
}
