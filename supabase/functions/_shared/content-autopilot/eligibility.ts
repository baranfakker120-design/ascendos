import { aspectFitsAutopilotSlot } from './formatAspect.ts';
import {
  AUTOPILOT_MIN_ELIGIBLE_ASSETS,
  type AutopilotEligibleAsset,
  type AutopilotSlotKind,
} from './types.ts';

/**
 * Gate eligibility (10-asset gate): images AND videos count.
 * Videos remain in the library and may be used as Video Stories only.
 */
export function isEligibleAutopilotAsset(asset: AutopilotEligibleAsset): boolean {
  if (!asset?.id) return false;
  if (!asset.storage_path || !String(asset.storage_path).trim()) return false;
  if (asset.media_kind !== 'image' && asset.media_kind !== 'video') return false;
  const mime = (asset.mime_type ?? '').toLowerCase();
  if (mime && mime.startsWith('image/') === false && mime.startsWith('video/') === false) {
    return false;
  }
  if (asset.analysis_status === 'failed') return false;
  return true;
}

/** Feed / Carousel pool — images only + feed aspect gate (Safe-Reject). Never video. */
export function isEligibleAutopilotFeedAsset(asset: AutopilotEligibleAsset): boolean {
  if (!isEligibleAutopilotAsset(asset)) return false;
  if (asset.media_kind !== 'image') return false;
  return aspectFitsAutopilotSlot(
    'feed',
    asset.aspect_ratio,
    asset.suggested_formats,
    asset.width_px,
    asset.height_px
  );
}

/** Story pool — image/video story + story aspect gate (Safe-Reject). */
export function isEligibleAutopilotStoryAsset(asset: AutopilotEligibleAsset): boolean {
  if (!isEligibleAutopilotAsset(asset)) return false;
  return aspectFitsAutopilotSlot(
    'story',
    asset.aspect_ratio,
    asset.suggested_formats,
    asset.width_px,
    asset.height_px
  );
}

export function isEligibleForSlotKind(
  asset: AutopilotEligibleAsset,
  slotKind: AutopilotSlotKind
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

export function countEligibleStoryAssets(assets: readonly AutopilotEligibleAsset[]): number {
  return assets.filter(isEligibleAutopilotStoryAsset).length;
}

export function canActivateAutopilot(
  assets: readonly AutopilotEligibleAsset[],
  minRequired = AUTOPILOT_MIN_ELIGIBLE_ASSETS
): { ok: true; count: number } | { ok: false; count: number; reason: 'below_min_assets' } {
  const count = countEligibleAssets(assets);
  if (count < minRequired) return { ok: false, count, reason: 'below_min_assets' };
  return { ok: true, count };
}

/** Mode-aware gate: only the pool that will actually be generated. */
export function canActivateAutopilotForMode(
  assets: readonly AutopilotEligibleAsset[],
  mode: 'stories' | 'feed' | 'full' | 'marked_stories' | string,
  minRequired = AUTOPILOT_MIN_ELIGIBLE_ASSETS
): { ok: true; count: number } | { ok: false; count: number; reason: 'below_min_assets' } {
  let count = countEligibleAssets(assets);
  if (mode === 'feed') count = countEligibleFeedAssets(assets);
  else if (mode === 'stories' || mode === 'marked_stories') count = countEligibleStoryAssets(assets);
  if (count < minRequired) return { ok: false, count, reason: 'below_min_assets' };
  return { ok: true, count };
}

/** Meine + Zentrale together — both scopes count when gate-eligible. */
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
