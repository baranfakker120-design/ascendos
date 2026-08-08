import { describe, expect, it } from 'vitest';
import { signOAuthState, verifyOAuthState } from './oauthState';

describe('oauth state HMAC', () => {
  const secret = 'test-secret-not-for-production';

  it('signs and verifies valid state', async () => {
    const state = await signOAuthState(
      {
        mid: 'm1',
        oid: 'o1',
        nonce: 'n1',
        exp: Math.floor(Date.now() / 1000) + 600,
      },
      secret
    );
    const payload = await verifyOAuthState(state, secret);
    expect(payload?.mid).toBe('m1');
    expect(payload?.oid).toBe('o1');
  });

  it('rejects tampered state', async () => {
    const state = await signOAuthState(
      { mid: 'm1', oid: 'o1', nonce: 'n1', exp: Math.floor(Date.now() / 1000) + 600 },
      secret
    );
    const bad = state.slice(0, -4) + 'xxxx';
    expect(await verifyOAuthState(bad, secret)).toBeNull();
  });

  it('rejects wrong secret', async () => {
    const state = await signOAuthState(
      { mid: 'm1', oid: 'o1', nonce: 'n1', exp: Math.floor(Date.now() / 1000) + 600 },
      secret
    );
    expect(await verifyOAuthState(state, 'other-secret')).toBeNull();
  });

  it('rejects expired state', async () => {
    const state = await signOAuthState(
      { mid: 'm1', oid: 'o1', nonce: 'n1', exp: Math.floor(Date.now() / 1000) - 10 },
      secret
    );
    expect(await verifyOAuthState(state, secret)).toBeNull();
  });

  it('rejects empty / malformed', async () => {
    expect(await verifyOAuthState('', secret)).toBeNull();
    expect(await verifyOAuthState('no-dot', secret)).toBeNull();
  });
});
