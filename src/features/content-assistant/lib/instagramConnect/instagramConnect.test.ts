import { describe, expect, it } from 'vitest';
import {
  assertNoTokenLeak,
  buildAuthorizeUrl,
  dbStatusToUi,
  isOAuthUserCancel,
  parseIgCallbackParam,
  toSafeConnection,
} from './index';

describe('dbStatusToUi', () => {
  it('maps pending_review to connecting', () => {
    expect(dbStatusToUi('pending_review')).toBe('connecting');
  });
  it('maps known statuses', () => {
    expect(dbStatusToUi('connected')).toBe('connected');
    expect(dbStatusToUi('error')).toBe('error');
    expect(dbStatusToUi('disconnected')).toBe('disconnected');
    expect(dbStatusToUi(null)).toBe('disconnected');
  });
});

describe('isOAuthUserCancel', () => {
  it('detects access_denied', () => {
    expect(isOAuthUserCancel('access_denied')).toBe(true);
    expect(isOAuthUserCancel('user_denied')).toBe(true);
  });
  it('does not treat API errors as cancel', () => {
    expect(isOAuthUserCancel('invalid_request')).toBe(false);
  });
});

describe('parseIgCallbackParam', () => {
  it('accepts known values', () => {
    expect(parseIgCallbackParam('connected')).toBe('connected');
    expect(parseIgCallbackParam('cancelled')).toBe('cancelled');
    expect(parseIgCallbackParam('denied')).toBe('denied');
    expect(parseIgCallbackParam('error')).toBe('error');
  });
  it('rejects unknown', () => {
    expect(parseIgCallbackParam('force')).toBeNull();
    expect(parseIgCallbackParam(null)).toBeNull();
  });
});

describe('toSafeConnection', () => {
  it('strips unknown fields and never requires token', () => {
    const safe = toSafeConnection({
      status: 'connected',
      igUserId: '123',
      igUsername: 'demo',
      scopes: ['instagram_business_basic'],
      connectedAt: '2026-08-08T12:00:00Z',
      lastError: null,
      oauthConfigured: true,
      token_ref: 'SHOULD_NOT_APPEAR_IN_TYPE',
    } as Record<string, unknown>);
    expect(safe.status).toBe('connected');
    expect(safe.igUsername).toBe('demo');
    expect(assertNoTokenLeak(safe)).toBe(true);
  });

  it('maps pending_review from loose payloads', () => {
    expect(toSafeConnection({ status: 'pending_review' }).status).toBe('connecting');
  });
});

describe('buildAuthorizeUrl', () => {
  it('builds official authorize URL with state and basic scope', () => {
    const url = buildAuthorizeUrl({
      appId: '990602627938098',
      redirectUri: 'https://example.supabase.co/functions/v1/instagram-oauth',
      state: 'abc.def',
    });
    expect(url.startsWith('https://www.instagram.com/oauth/authorize?')).toBe(true);
    expect(url).toContain('client_id=990602627938098');
    expect(url).toContain('response_type=code');
    expect(url).toContain('scope=instagram_business_basic');
    expect(url).toContain('state=abc.def');
    expect(url).not.toContain('instagram_business_content_publish');
  });
});

describe('assertNoTokenLeak', () => {
  it('fails on token_ref / access_token', () => {
    expect(assertNoTokenLeak({ token_ref: 'x' })).toBe(false);
    expect(assertNoTokenLeak({ access_token: 'x' })).toBe(false);
    expect(assertNoTokenLeak({ accessToken: 'x' })).toBe(false);
  });
});
