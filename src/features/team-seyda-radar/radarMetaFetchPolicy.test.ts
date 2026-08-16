import { describe, expect, it } from 'vitest';
import {
  META_MAX_RETRIES,
  META_RATE_LIMIT_BACKOFF_MS,
  META_RETRY_BASE_MS,
  classifyMetaHttpStatus,
  decideMetaRetry,
  errorKindFromFetchFailure,
  metaBackoffMs,
  withJitter,
} from './radarMetaFetchPolicy';

describe('RADAR Meta error classification', () => {
  it('maps 401 to meta_auth_error (no aggressive retry)', () => {
    expect(classifyMetaHttpStatus(401)).toBe('meta_auth_error');
    expect(decideMetaRetry('meta_auth_error', 0)).toBe('do_not_retry');
    expect(decideMetaRetry('meta_auth_error', 1)).toBe('do_not_retry');
  });

  it('maps 403 to meta_forbidden (no retry)', () => {
    expect(classifyMetaHttpStatus(403)).toBe('meta_forbidden');
    expect(decideMetaRetry('meta_forbidden', 0)).toBe('do_not_retry');
  });

  it('429: one limited backoff then defer to next hour', () => {
    expect(classifyMetaHttpStatus(429)).toBe('meta_rate_limited');
    expect(decideMetaRetry('meta_rate_limited', 0)).toBe('retry_with_backoff');
    expect(decideMetaRetry('meta_rate_limited', 1)).toBe('defer_to_next_hour');
    expect(metaBackoffMs('meta_rate_limited', 0)).toBe(META_RATE_LIMIT_BACKOFF_MS);
  });

  it('5xx: up to META_MAX_RETRIES with exponential backoff', () => {
    expect(classifyMetaHttpStatus(502)).toBe('meta_server_error');
    expect(decideMetaRetry('meta_server_error', 0)).toBe('retry_with_backoff');
    expect(decideMetaRetry('meta_server_error', 1)).toBe('retry_with_backoff');
    expect(decideMetaRetry('meta_server_error', META_MAX_RETRIES)).toBe('defer_to_next_hour');
    expect(metaBackoffMs('meta_server_error', 0)).toBe(META_RETRY_BASE_MS);
    expect(metaBackoffMs('meta_server_error', 1)).toBe(META_RETRY_BASE_MS * 2);
  });

  it('timeout / network follow 5xx retry budget', () => {
    expect(errorKindFromFetchFailure({ httpStatus: 0, timedOut: true })).toBe('meta_timeout');
    expect(errorKindFromFetchFailure({ httpStatus: 0, networkError: true })).toBe(
      'meta_network_error'
    );
    expect(decideMetaRetry('meta_timeout', 0)).toBe('retry_with_backoff');
    expect(decideMetaRetry('meta_network_error', META_MAX_RETRIES)).toBe('defer_to_next_hour');
  });

  it('withJitter stays within ±25%', () => {
    expect(withJitter(1000, 0)).toBe(750);
    expect(withJitter(1000, 1)).toBe(1250);
    expect(withJitter(1000, 0.5)).toBe(1000);
  });
});
