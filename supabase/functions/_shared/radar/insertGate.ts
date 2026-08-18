/**
 * Pure RADAR insert gates for Edge Discovery (Deno).
 * Keep in sync with src/features/team-seyda-radar/radarInsertGate.ts
 */

export const TEAM_SEYDA_ORG_ID = '00000000-0000-0000-0000-000000000001';

export type RadarSource = 'chogan' | 'essence_tribe' | 'chogan_beauty';
export type RadarContentType = 'POST' | 'REEL';

export interface RadarNormalizedItem {
  source: RadarSource;
  external_id: string;
  content_type: RadarContentType;
  published_at: string;
  canonical_url: string;
}

/** Server-side startpoint: published_at >= radar_started_at (inclusive). */
export function isOnOrAfterRadarStartpoint(
  publishedAtIso: string,
  radarStartedAtIso: string
): boolean {
  const publishedMs = Date.parse(publishedAtIso);
  const startedMs = Date.parse(radarStartedAtIso);
  if (!Number.isFinite(publishedMs) || !Number.isFinite(startedMs)) return false;
  return publishedMs >= startedMs;
}

export function filterItemsByRadarStartpoint<T extends { published_at: string }>(
  items: readonly T[],
  radarStartedAtIso: string
): T[] {
  return items.filter((item) => isOnOrAfterRadarStartpoint(item.published_at, radarStartedAtIso));
}

export function partitionNewVsDuplicate<T extends { external_id: string }>(
  candidates: readonly T[],
  existingExternalIds: ReadonlySet<string>
): { fresh: T[]; duplicates: T[] } {
  const fresh: T[] = [];
  const duplicates: T[] = [];
  for (const item of candidates) {
    if (existingExternalIds.has(item.external_id)) duplicates.push(item);
    else fresh.push(item);
  }
  return { fresh, duplicates };
}

/**
 * Discovery writes are Org #1 only. Client/body org ids are ignored unless forged.
 */
export function resolveRadarWriteOrgId(clientOrgId: unknown): string | null {
  if (clientOrgId == null || clientOrgId === '') return TEAM_SEYDA_ORG_ID;
  if (typeof clientOrgId !== 'string') return null;
  if (clientOrgId === TEAM_SEYDA_ORG_ID) return TEAM_SEYDA_ORG_ID;
  return null;
}

export function mapUsernameToSource(username: string): RadarSource | null {
  if (username === 'chogangroupofficial') return 'chogan';
  if (username === 'essencetribe.network') return 'essence_tribe';
  if (username === 'choganbeautyofficial') return 'chogan_beauty';
  return null;
}

/** Canonical Business Discovery targets — same list the hourly edge function iterates. */
export const RADAR_DISCOVERY_TARGETS: ReadonlyArray<{ username: string; source: RadarSource }> = [
  { username: 'chogangroupofficial', source: 'chogan' },
  { username: 'essencetribe.network', source: 'essence_tribe' },
  { username: 'choganbeautyofficial', source: 'chogan_beauty' },
];

export function mapMediaToContentType(
  mediaType: string | undefined,
  permalink: string | undefined
): RadarContentType {
  const p = (permalink ?? '').toLowerCase();
  if (p.includes('/reel/')) return 'REEL';
  if ((mediaType ?? '').toUpperCase() === 'VIDEO') return 'REEL';
  return 'POST';
}
