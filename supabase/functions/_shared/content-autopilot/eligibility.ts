import {
  AUTOPILOT_MIN_ELIGIBLE_ASSETS,
  type AutopilotEligibleAsset,
} from './types.ts';

/**
 * Autopilot V1 optimization: image-only automatic publishing.
 * Videos/Reels stay in the library and manual workflow — not deleted.
 */
export function isEligibleAutopilotAsset(asset: AutopilotEligibleAsset): boolean {
  if (!asset?.id) return false;
  if (!asset.storage_path || !String(asset.storage_path).trim()) return false;
  if (asset.media_kind !== 'image') return false;
  const mime = (asset.mime_type ?? '').toLowerCase();
  if (mime && !mime.startsWith('image/')) return false;
  if (asset.analysis_status === 'failed') return false;
  return true;
}

export function countEligibleAssets(assets: readonly AutopilotEligibleAsset[]): number {
  return assets.filter(isEligibleAutopilotAsset).length;
}

export function canActivateAutopilot(
  assets: readonly AutopilotEligibleAsset[],
  minRequired = AUTOPILOT_MIN_ELIGIBLE_ASSETS
): { ok: true; count: number } | { ok: false; count: number; reason: 'below_min_assets' } {
  const count = countEligibleAssets(assets);
  if (count < minRequired) return { ok: false, count, reason: 'below_min_assets' };
  return { ok: true, count };
}

/** Meine + Zentrale together — both scopes count when eligible. */
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
