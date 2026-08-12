/**
 * Content asset library + multi-upload planning (pure).
 *
 * Library capacity (50) is independent of manual carousel max (10)
 * and of Autopilot single-image feed rules.
 */

/** Personal library hard default — must stay in sync with DB content_asset_limit default. */
export const CONTENT_LIBRARY_ASSET_LIMIT = 50;

/** Max files accepted from one file-picker selection. */
export const CONTENT_UPLOAD_BATCH_MAX = 10;

export interface MultiUploadPlan {
  /** How many of the selected files will be uploaded. */
  acceptCount: number;
  /** Selected beyond the per-batch max (e.g. 11th+). */
  skippedOverBatch: number;
  /** Selected within batch max but blocked by remaining library slots. */
  skippedOverQuota: number;
  /** True when acceptCount fills the library to capacity. */
  libraryWillBeFull: boolean;
}

/**
 * Decide how many of `selectedCount` files may upload given remaining library seats.
 * Never silently drops without reporting skip counts.
 */
export function planMultiUpload(params: {
  selectedCount: number;
  remainingSlots: number;
  maxBatch?: number;
  libraryLimit?: number;
  usedCount?: number;
}): MultiUploadPlan {
  const maxBatch = params.maxBatch ?? CONTENT_UPLOAD_BATCH_MAX;
  const selected = Math.max(0, Math.floor(params.selectedCount));
  const remaining = Math.max(0, Math.floor(params.remainingSlots));
  const withinBatch = Math.min(selected, maxBatch);
  const skippedOverBatch = Math.max(0, selected - withinBatch);
  const acceptCount = Math.min(withinBatch, remaining);
  const skippedOverQuota = Math.max(0, withinBatch - acceptCount);

  let libraryWillBeFull = false;
  if (
    typeof params.usedCount === 'number' &&
    typeof params.libraryLimit === 'number' &&
    acceptCount > 0
  ) {
    libraryWillBeFull = params.usedCount + acceptCount >= params.libraryLimit;
  } else if (acceptCount > 0 && remaining > 0) {
    libraryWillBeFull = acceptCount >= remaining;
  }

  return {
    acceptCount,
    skippedOverBatch,
    skippedOverQuota,
    libraryWillBeFull,
  };
}

/** Remaining personal seats before hitting the library limit. */
export function remainingLibrarySlots(used: number, limit: number): number {
  return Math.max(0, Math.floor(limit) - Math.max(0, Math.floor(used)));
}

export function isLibraryUploadDisabled(params: {
  used: number;
  limit: number;
  canUpload: boolean;
  uploading: boolean;
}): boolean {
  if (params.uploading) return true;
  if (!params.canUpload) return true;
  return remainingLibrarySlots(params.used, params.limit) <= 0;
}
