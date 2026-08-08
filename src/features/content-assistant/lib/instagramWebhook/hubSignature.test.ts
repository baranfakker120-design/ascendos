import { describe, expect, it } from 'vitest';
import { signHubBody, timingSafeEqualString, verifyHubSignature256 } from './hubSignature';

describe('Meta X-Hub-Signature-256', () => {
  const secret = 'test-meta-app-secret';
  const body = '{"object":"instagram","entry":[{"id":"1","time":1}]}';

  it('accepts a valid signature', async () => {
    const header = await signHubBody(body, secret);
    expect(await verifyHubSignature256(body, header, secret)).toBe(true);
  });

  it('rejects tampered body', async () => {
    const header = await signHubBody(body, secret);
    expect(await verifyHubSignature256(body + ' ', header, secret)).toBe(false);
  });

  it('rejects wrong secret', async () => {
    const header = await signHubBody(body, secret);
    expect(await verifyHubSignature256(body, header, 'other-secret')).toBe(false);
  });

  it('rejects missing / malformed header', async () => {
    expect(await verifyHubSignature256(body, null, secret)).toBe(false);
    expect(await verifyHubSignature256(body, 'sha256=deadbeef', secret)).toBe(false);
    expect(await verifyHubSignature256(body, 'md5=abc', secret)).toBe(false);
  });
});

describe('verify token compare', () => {
  it('matches equal tokens', () => {
    expect(timingSafeEqualString('meatyhamhock', 'meatyhamhock')).toBe(true);
  });

  it('rejects unequal tokens', () => {
    expect(timingSafeEqualString('meatyhamhock', 'other')).toBe(false);
    expect(timingSafeEqualString('abc', 'abd')).toBe(false);
  });
});
