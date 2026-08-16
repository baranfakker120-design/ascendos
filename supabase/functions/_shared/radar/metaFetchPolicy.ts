/**
 * Meta HTTP error classification + retry policy for RADAR Discovery.
 * Keep in sync with src/features/team-seyda-radar/radarMetaFetchPolicy.ts
 *
 * No auto token refresh. Cron must not tight-loop on auth failures.
 */

export type MetaErrorKind =
  | 'ok'
  | 'meta_auth_error'
  | 'meta_forbidden'
  | 'meta_rate_limited'
  | 'meta_server_error'
  | 'meta_timeout'
  | 'meta_network_error'
  | 'meta_client_error'
  | 'meta_invalid_json'
  | 'business_discovery_empty'
  | 'unknown';

export type MetaRetryDecision = 'do_not_retry' | 'retry_with_backoff' | 'defer_to_next_hour';

/** Max additional attempts after the first try within a single target fetch. */
export const META_MAX_RETRIES = 2;

/** Base backoff for 5xx / timeout retries (ms). Jitter applied by caller. */
export const META_RETRY_BASE_MS = 400;

/** Single limited backoff for 429 before deferring to next hourly cron. */
export const META_RATE_LIMIT_BACKOFF_MS = 1200;

export function classifyMetaHttpStatus(httpStatus: number): MetaErrorKind {
  if (httpStatus === 0) return 'meta_network_error';
  if (httpStatus === 401) return 'meta_auth_error';
  if (httpStatus === 403) return 'meta_forbidden';
  if (httpStatus === 429) return 'meta_rate_limited';
  if (httpStatus >= 500 && httpStatus <= 599) return 'meta_server_error';
  if (httpStatus >= 400 && httpStatus <= 499) return 'meta_client_error';
  if (httpStatus >= 200 && httpStatus < 300) return 'ok';
  return 'unknown';
}

/**
 * Decide retry behavior for a Meta failure.
 * attemptIndex: 0 = first failure after initial request.
 */
export function decideMetaRetry(
  kind: MetaErrorKind,
  attemptIndex: number
): MetaRetryDecision {
  if (kind === 'meta_auth_error' || kind === 'meta_forbidden' || kind === 'meta_client_error') {
    return 'do_not_retry';
  }
  if (kind === 'meta_rate_limited') {
    // One limited backoff at most, then wait for next hourly cron.
    return attemptIndex === 0 ? 'retry_with_backoff' : 'defer_to_next_hour';
  }
  if (
    kind === 'meta_server_error' ||
    kind === 'meta_timeout' ||
    kind === 'meta_network_error'
  ) {
    return attemptIndex < META_MAX_RETRIES ? 'retry_with_backoff' : 'defer_to_next_hour';
  }
  return 'do_not_retry';
}

/** Deterministic backoff ms (tests); production adds jitter via `withJitter`. */
export function metaBackoffMs(kind: MetaErrorKind, attemptIndex: number): number {
  if (kind === 'meta_rate_limited') return META_RATE_LIMIT_BACKOFF_MS;
  return META_RETRY_BASE_MS * 2 ** Math.max(0, attemptIndex);
}

export function withJitter(baseMs: number, random01: number = Math.random()): number {
  const r = Math.min(1, Math.max(0, random01));
  // ±25% jitter
  return Math.round(baseMs * (0.75 + r * 0.5));
}

export function errorKindFromFetchFailure(opts: {
  httpStatus: number;
  timedOut?: boolean;
  networkError?: boolean;
  invalidJson?: boolean;
  emptyDiscovery?: boolean;
}): MetaErrorKind {
  if (opts.timedOut) return 'meta_timeout';
  if (opts.networkError) return 'meta_network_error';
  if (opts.invalidJson) return 'meta_invalid_json';
  if (opts.emptyDiscovery) return 'business_discovery_empty';
  return classifyMetaHttpStatus(opts.httpStatus);
}
