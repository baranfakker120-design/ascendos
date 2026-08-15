/**
 * Team Seyda Radar — per-user startpoint gate (pure / unit-tested).
 *
 * Rule: only Instagram items with published_at >= radar_started_at count as new.
 * Prefer published_at over detected_at. Never treat pre-activation posts as hits.
 * radar_started_at is set once on activation and must not move on poll/login.
 */

export type RadarContentType = 'POST' | 'REEL';

export type RadarSourceKey = 'chogan' | 'essence_tribe';

export interface RadarPublishedItem {
  external_id: string;
  source: RadarSourceKey;
  content_type: RadarContentType;
  /** Instagram publish time (UTC ISO or Date). Authority for “new”. */
  published_at: string | Date;
  /** Optional scheduler observe time — NEVER used as startpoint filter. */
  detected_at?: string | Date | null;
}

export interface RadarUserStartpoint {
  user_id: string;
  organization_id: string;
  /** UTC instant when radar was successfully activated. Immutable on poll. */
  radar_started_at: string;
  /** soft pause — startpoint kept */
  paused?: boolean;
}

export type RadarStartpointDecision =
  | { accept: true; reason: 'published_at_on_or_after_start' }
  | {
      accept: false;
      reason: 'before_start' | 'missing_published_at' | 'missing_startpoint' | 'paused';
    };

function toMs(value: string | Date | null | undefined): number | null {
  if (value == null || value === '') return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Activate radar: capture server NOW as startpoint (caller supplies UTC ISO).
 * Does not import historical posts — filter uses this boundary only.
 */
export function createRadarStartpoint(params: {
  userId: string;
  organizationId: string;
  /** Server clock UTC ISO — never trust client-only time as authority. */
  activatedAtUtcIso: string;
}): RadarUserStartpoint {
  const ms = toMs(params.activatedAtUtcIso);
  if (!ms) throw new Error('radar_started_at_invalid');
  return {
    user_id: params.userId,
    organization_id: params.organizationId,
    radar_started_at: new Date(ms).toISOString(),
    paused: false,
  };
}

/** Poll must never rewrite radar_started_at. */
export function assertStartpointUnchangedByPoll(
  before: RadarUserStartpoint,
  after: RadarUserStartpoint
): boolean {
  return before.radar_started_at === after.radar_started_at && before.user_id === after.user_id;
}

/**
 * Explicit reconnect with “new start” — only then replace startpoint.
 * Pause/resume keeps the original startpoint.
 */
export function reactivateRadarWithNewStart(
  current: RadarUserStartpoint,
  activatedAtUtcIso: string
): RadarUserStartpoint {
  return createRadarStartpoint({
    userId: current.user_id,
    organizationId: current.organization_id,
    activatedAtUtcIso,
  });
}

export function pauseRadar(state: RadarUserStartpoint): RadarUserStartpoint {
  return { ...state, paused: true };
}

export function resumeRadar(state: RadarUserStartpoint): RadarUserStartpoint {
  return { ...state, paused: false };
}

/**
 * published_at >= radar_started_at → new hit.
 * Equality: treated as on-or-after start (inclusive boundary).
 */
export function decideRadarItemAgainstStartpoint(
  item: RadarPublishedItem,
  start: RadarUserStartpoint | null | undefined
): RadarStartpointDecision {
  if (!start?.radar_started_at) return { accept: false, reason: 'missing_startpoint' };
  if (start.paused) return { accept: false, reason: 'paused' };
  const publishedMs = toMs(item.published_at);
  if (publishedMs == null) return { accept: false, reason: 'missing_published_at' };
  const startMs = toMs(start.radar_started_at);
  if (startMs == null) return { accept: false, reason: 'missing_startpoint' };
  if (publishedMs < startMs) return { accept: false, reason: 'before_start' };
  return { accept: true, reason: 'published_at_on_or_after_start' };
}

/** Filter a media list — old archive never becomes radar hits. */
export function filterNewRadarItems(
  items: RadarPublishedItem[],
  start: RadarUserStartpoint | null | undefined
): RadarPublishedItem[] {
  return items.filter((item) => decideRadarItemAgainstStartpoint(item, start).accept);
}

export function radarItemDedupeKey(
  userId: string,
  source: RadarSourceKey,
  externalId: string
): string {
  return `${userId}::${source}::${externalId}`;
}

/** Keep first occurrence per user+source+external_id. */
export function dedupeRadarItemsForUser(
  userId: string,
  items: RadarPublishedItem[]
): RadarPublishedItem[] {
  const seen = new Set<string>();
  const out: RadarPublishedItem[] = [];
  for (const item of items) {
    const key = radarItemDedupeKey(userId, item.source, item.external_id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Full ingest gate for one poll: startpoint filter then dedupe.
 * detected_at is ignored for acceptance.
 */
export function selectRadarHitsForUser(params: {
  userId: string;
  start: RadarUserStartpoint | null | undefined;
  candidates: RadarPublishedItem[];
}): RadarPublishedItem[] {
  const fresh = filterNewRadarItems(params.candidates, params.start);
  return dedupeRadarItemsForUser(params.userId, fresh);
}

export type CoachARadarIndicator = 'normal' | 'blink_red';

/** Coach center “A” — blink only when unresolved new radar hits exist. */
export function coachARadarIndicator(newUnresolvedCount: number): CoachARadarIndicator {
  return newUnresolvedCount > 0 ? 'blink_red' : 'normal';
}

export function countUnresolvedRadarHits(hits: ReadonlyArray<{ resolved?: boolean }>): number {
  return hits.filter((h) => !h.resolved).length;
}
