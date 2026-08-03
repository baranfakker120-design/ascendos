/** Pure helpers for Leader Experience (unit-tested). */

export function missingFirstlines(active: number, required = 5): number {
  return Math.max(0, required - active);
}

export function goalProgressPct(current: number, goal: number): number {
  if (!goal || goal <= 0) return 0;
  return Math.min(100, Math.round((current / goal) * 100));
}

export function sortFavoritesFirst<
  T extends { membershipId: string; depth: number; isFavorite?: boolean; firstName?: string },
>(nodes: T[]): T[] {
  return [...nodes].sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    const af = a.isFavorite ? 1 : 0;
    const bf = b.isFavorite ? 1 : 0;
    if (af !== bf) return bf - af;
    return (a.firstName ?? '').localeCompare(b.firstName ?? '', 'de');
  });
}
