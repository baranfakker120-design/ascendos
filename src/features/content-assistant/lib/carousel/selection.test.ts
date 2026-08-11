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

describe('carousel selection', () => {
  it('detects carousel mode at 2+', () => {
    expect(isCarouselMode(1)).toBe(false);
    expect(isCarouselMode(2)).toBe(true);
    expect(isCarouselMode(10)).toBe(true);
  });

  it('blocks an 11th image', () => {
    const ids = Array.from({ length: CAROUSEL_MAX_SLIDES }, (_, i) => `a${i}`);
    expect(ids).toHaveLength(10);
    expect(
      canAddToSelection({
        currentIds: ids,
        nextId: 'g',
        nextKind: 'image',
        existingKinds: ids.map(() => 'image' as const),
      })
    ).toEqual({ ok: false, reason: 'max' });
    expect(addToSelection(ids, 'g')).toEqual(ids);
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

  it('formats the counter against max 10', () => {
    expect(selectionCounter(0)).toBe('0 / 10');
    expect(selectionCounter(3)).toBe('3 / 10');
    expect(selectionCounter(10)).toBe('10 / 10');
  });
});
