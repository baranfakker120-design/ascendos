import type { ContentAsset, ContentAssetScope } from '../../contentAssetsApi';

/**
 * Library tabs Meine / Zentrale must stay mutually exclusive.
 * Uses existing `content_assets.scope` (+ membership for personal ownership).
 * Does not mutate or delete rows.
 */
export function filterLibraryAssetsByScope(
  assets: readonly ContentAsset[],
  scope: ContentAssetScope,
  membershipId: string | null | undefined
): ContentAsset[] {
  if (scope === 'central') {
    return assets.filter((asset) => asset.scope === 'central');
  }
  return assets.filter(
    (asset) =>
      asset.scope === 'personal' &&
      (membershipId == null || asset.owner_membership_id === membershipId)
  );
}
