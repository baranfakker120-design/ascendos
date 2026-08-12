import { describe, expect, it } from 'vitest';
import {
  CONTENT_LIBRARY_ASSET_LIMIT,
  CONTENT_UPLOAD_BATCH_MAX,
  isLibraryUploadDisabled,
  planMultiUpload,
  remainingLibrarySlots,
} from './multiUpload';
import { CAROUSEL_MAX_SLIDES } from '../carousel/selection';

describe('content asset multi-upload planning', () => {
  it('library default is 50 (was 25)', () => {
    expect(CONTENT_LIBRARY_ASSET_LIMIT).toBe(50);
    expect(CONTENT_UPLOAD_BATCH_MAX).toBe(10);
    expect(CAROUSEL_MAX_SLIDES).toBe(10);
    expect(CONTENT_LIBRARY_ASSET_LIMIT).toBeGreaterThan(CAROUSEL_MAX_SLIDES);
  });

  it('single upload path: 1 selected with room → accept 1', () => {
    expect(
      planMultiUpload({ selectedCount: 1, remainingSlots: 50, usedCount: 0, libraryLimit: 50 })
    ).toEqual({
      acceptCount: 1,
      skippedOverBatch: 0,
      skippedOverQuota: 0,
      libraryWillBeFull: false,
    });
  });

  it('multi-upload with 2 images', () => {
    const plan = planMultiUpload({
      selectedCount: 2,
      remainingSlots: 40,
      usedCount: 10,
      libraryLimit: 50,
    });
    expect(plan.acceptCount).toBe(2);
    expect(plan.skippedOverBatch).toBe(0);
    expect(plan.skippedOverQuota).toBe(0);
  });

  it('multi-upload with 10 images', () => {
    const plan = planMultiUpload({
      selectedCount: 10,
      remainingSlots: 50,
      usedCount: 0,
      libraryLimit: 50,
    });
    expect(plan.acceptCount).toBe(10);
    expect(plan.skippedOverBatch).toBe(0);
  });

  it('11 selected → max 10 uploads per batch', () => {
    const plan = planMultiUpload({
      selectedCount: 11,
      remainingSlots: 50,
      usedCount: 0,
      libraryLimit: 50,
    });
    expect(plan.acceptCount).toBe(10);
    expect(plan.skippedOverBatch).toBe(1);
    expect(plan.skippedOverQuota).toBe(0);
  });

  it('47/50 + 6 selected → only 3 accepted', () => {
    const plan = planMultiUpload({
      selectedCount: 6,
      remainingSlots: remainingLibrarySlots(47, 50),
      usedCount: 47,
      libraryLimit: 50,
    });
    expect(plan.acceptCount).toBe(3);
    expect(plan.skippedOverQuota).toBe(3);
    expect(plan.skippedOverBatch).toBe(0);
    expect(plan.libraryWillBeFull).toBe(true);
  });

  it('50/50 → upload disabled', () => {
    expect(
      isLibraryUploadDisabled({
        used: 50,
        limit: 50,
        canUpload: false,
        uploading: false,
      })
    ).toBe(true);
    expect(remainingLibrarySlots(50, 50)).toBe(0);
    expect(
      planMultiUpload({ selectedCount: 3, remainingSlots: 0, usedCount: 50, libraryLimit: 50 })
        .acceptCount
    ).toBe(0);
  });

  it('carousel max stays 10 and independent of library 50', () => {
    expect(CAROUSEL_MAX_SLIDES).toBe(10);
    expect(CONTENT_LIBRARY_ASSET_LIMIT).toBe(50);
  });
});
