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
    expect(isCarouselMode(6)).toBe(true);
  });

  it('blocks a 7th image', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(ids).toHaveLength(CAROUSEL_MAX_SLIDES);
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

  it('reorders with drag semantics', () => {
    expect(reorderSelection(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(reorderSelection(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('formats live counter', () => {
    expect(selectionCounter(0)).toBe('0 / 6');
    expect(selectionCounter(3)).toBe('3 / 6');
    expect(selectionCounter(6)).toBe('6 / 6');
  });
});
