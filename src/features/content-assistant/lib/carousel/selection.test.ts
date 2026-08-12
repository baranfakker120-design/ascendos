import { describe, expect, it } from 'vitest';
import {
  addToSelection,
  canAddToSelection,
  CAROUSEL_MAX_SLIDES,
  isCarouselMode,
  removeFromSelection,
  reorderSelection,
  replaceInSelection,
  selectionCounter,
} from './selection';

/** Library capacity — must stay independent of carousel slide max. */
const LIBRARY_ASSET_CAPACITY = 25;

describe('carousel selection', () => {
  it('uses Instagram Graph max of 10 slides (not library capacity)', () => {
    expect(CAROUSEL_MAX_SLIDES).toBe(10);
    expect(LIBRARY_ASSET_CAPACITY).toBe(25);
    expect(CAROUSEL_MAX_SLIDES).toBeLessThan(LIBRARY_ASSET_CAPACITY);
  });

  it('detects carousel mode at 2+', () => {
    expect(isCarouselMode(1)).toBe(false);
    expect(isCarouselMode(2)).toBe(true);
    expect(isCarouselMode(6)).toBe(true);
    expect(isCarouselMode(10)).toBe(true);
  });

  it('allows 1, 2, 6, and 10 images', () => {
    for (const n of [1, 2, 6, 10]) {
      const ids = Array.from({ length: n }, (_, i) => `a${i}`);
      expect(ids).toHaveLength(n);
      if (n < CAROUSEL_MAX_SLIDES) {
        expect(
          canAddToSelection({
            currentIds: ids,
            nextId: 'next',
            nextKind: 'image',
            existingKinds: ids.map(() => 'image' as const),
          })
        ).toEqual({ ok: true });
      }
    }
  });

  it('blocks an 11th image', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `a${i}`);
    expect(ids).toHaveLength(CAROUSEL_MAX_SLIDES);
    expect(
      canAddToSelection({
        currentIds: ids,
        nextId: 'a10',
        nextKind: 'image',
        existingKinds: ids.map(() => 'image' as const),
      })
    ).toEqual({ ok: false, reason: 'max' });
    expect(addToSelection(ids, 'a10')).toEqual(ids);
  });

  it('blocks duplicate assets inside one carousel', () => {
    expect(
      canAddToSelection({
        currentIds: ['a', 'b'],
        nextId: 'a',
        nextKind: 'image',
        existingKinds: ['image', 'image'],
      })
    ).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('blocks mixing video into an image selection', () => {
    expect(
      canAddToSelection({
        currentIds: ['a'],
        nextId: 'v',
        nextKind: 'video',
        existingKinds: ['image'],
      })
    ).toEqual({ ok: false, reason: 'video_mix' });
  });

  it('removes and collapses order', () => {
    expect(removeFromSelection(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('replaces at the same index', () => {
    expect(replaceInSelection(['a', 'b', 'c'], 1, 'x')).toEqual(['a', 'x', 'c']);
  });

  it('reorders within bounds', () => {
    expect(reorderSelection(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('reorders 10 assets with drag semantics', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `a${i}`);
    expect(reorderSelection(ten, 0, 9)).toEqual([
      'a1',
      'a2',
      'a3',
      'a4',
      'a5',
      'a6',
      'a7',
      'a8',
      'a9',
      'a0',
    ]);
    expect(reorderSelection(ten, 9, 0)[0]).toBe('a9');
  });

  it('formats the counter against max 10', () => {
    expect(selectionCounter(0)).toBe('0 / 10');
    expect(selectionCounter(3)).toBe('3 / 10');
    expect(selectionCounter(10)).toBe('10 / 10');
    expect(selectionCounter(11)).toBe('10 / 10');
  });
});
