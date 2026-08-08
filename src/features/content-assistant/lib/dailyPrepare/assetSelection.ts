/** Asset ranking / format — mirrors edge `_shared/content-daily/assetSelection`. */

export type ContentFormat = 'story' | 'feed' | 'reel';

export interface SelectableAsset {
  id: string;
  scope: 'personal' | 'central' | string;
  owner_membership_id: string;
  media_kind: 'image' | 'video' | string;
  last_used_at: string | null;
  usage_count: number;
  created_at: string;
  suggested_formats: string[] | null;
  aspect_ratio: string | null;
  storage_path: string;
}

export const ASSET_COOLDOWN_DAYS = 7;

export function rankContentAssets(assets: SelectableAsset[]): SelectableAsset[] {
  return [...assets].sort((a, b) => {
    const scopeRank = (s: string) => (s === 'personal' ? 0 : 1);
    const sa = scopeRank(a.scope);
    const sb = scopeRank(b.scope);
    if (sa !== sb) return sa - sb;

    const aUnused = a.last_used_at == null ? 0 : 1;
    const bUnused = b.last_used_at == null ? 0 : 1;
    if (aUnused !== bUnused) return aUnused - bUnused;

    if (a.usage_count !== b.usage_count) return a.usage_count - b.usage_count;

    return a.created_at.localeCompare(b.created_at);
  });
}

export function filterExcludedAssets(
  assets: SelectableAsset[],
  excludedIds: Set<string>
): SelectableAsset[] {
  return assets.filter((a) => a.storage_path && !excludedIds.has(a.id));
}

export function selectBestAsset(
  assets: SelectableAsset[],
  excludedIds: Set<string>
): SelectableAsset | null {
  const ranked = rankContentAssets(filterExcludedAssets(assets, excludedIds));
  return ranked[0] ?? null;
}

export function chooseContentFormat(asset: SelectableAsset): ContentFormat {
  const suggested = (asset.suggested_formats ?? [])
    .map((f) => String(f).toLowerCase())
    .filter((f): f is ContentFormat => f === 'story' || f === 'feed' || f === 'reel');

  if (asset.media_kind === 'video') {
    if (suggested.includes('reel')) return 'reel';
    return 'reel';
  }

  if (suggested[0]) return suggested[0];

  if (asset.aspect_ratio === '9:16') return 'story';
  if (asset.aspect_ratio === '4:5' || asset.aspect_ratio === '1:1') return 'feed';

  return 'feed';
}

/** Pure idempotency helper for tests / docs. */
export function shouldSkipReadyPrep(status: string | null | undefined): boolean {
  return status === 'ready';
}
