/** Carousel selection helpers — max 10 images; single-image path when length === 1. */

export const CAROUSEL_MAX_SLIDES = 10;

export type CarouselMediaKind = 'image' | 'video';

export function isCarouselMode(count: number): boolean {
  return count >= 2;
}

export function canAddToSelection(params: {
  currentIds: readonly string[];
  nextId: string;
  nextKind: CarouselMediaKind;
  existingKinds: readonly CarouselMediaKind[];
}): { ok: true } | { ok: false; reason: 'duplicate' | 'max' | 'video_mix' | 'video_limit' } {
  const { currentIds, nextId, nextKind, existingKinds } = params;
  if (currentIds.includes(nextId)) return { ok: false, reason: 'duplicate' };
  if (currentIds.length >= CAROUSEL_MAX_SLIDES) return { ok: false, reason: 'max' };

  const existingHasVideo = existingKinds.includes('video');
  const existingHasImage = existingKinds.includes('image');

  // Videos remain single-asset in V1 (no mixed / multi-video carousel).
  if (nextKind === 'video' && currentIds.length > 0) return { ok: false, reason: 'video_mix' };
  if (existingHasVideo && currentIds.length >= 1) return { ok: false, reason: 'video_limit' };
  if (existingHasImage && nextKind === 'video') return { ok: false, reason: 'video_mix' };

  return { ok: true };
}

export function addToSelection(ids: readonly string[], nextId: string): string[] {
  if (ids.includes(nextId)) return [...ids];
  if (ids.length >= CAROUSEL_MAX_SLIDES) return [...ids];
  return [...ids, nextId];
}

export function removeFromSelection(ids: readonly string[], removeId: string): string[] {
  return ids.filter((id) => id !== removeId);
}

export function replaceInSelection(
  ids: readonly string[],
  index: number,
  nextId: string
): string[] {
  if (index < 0 || index >= ids.length) return [...ids];
  const next = [...ids];
  // Drop duplicate of nextId elsewhere so order position stays unique.
  const withoutDup = next.map((id, i) => (i !== index && id === nextId ? null : id));
  withoutDup[index] = nextId;
  return withoutDup.filter((id): id is string => Boolean(id));
}

export function reorderSelection(
  ids: readonly string[],
  fromIndex: number,
  toIndex: number
): string[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= ids.length ||
    toIndex >= ids.length ||
    fromIndex === toIndex
  ) {
    return [...ids];
  }
  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function selectionCounter(count: number): string {
  return `${Math.min(count, CAROUSEL_MAX_SLIDES)} / ${CAROUSEL_MAX_SLIDES}`;
}
