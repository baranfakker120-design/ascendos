import { describe, expect, it } from 'vitest';
import { buildSignedRequest, parseSignedRequest } from './signedRequest';

describe('Meta signed_request', () => {
  const secret = 'test-meta-app-secret';

  it('parses a valid Meta signed_request', async () => {
    const signed = await buildSignedRequest(
      {
        algorithm: 'HMAC-SHA256',
        user_id: '17841400000000000',
        issued_at: 1_700_000_000,
      },
      secret
    );
    const payload = await parseSignedRequest(signed, secret);
    expect(payload?.user_id).toBe('17841400000000000');
    expect(payload?.algorithm).toBe('HMAC-SHA256');
  });

  it('rejects tampered payload', async () => {
    const signed = await buildSignedRequest({ algorithm: 'HMAC-SHA256', user_id: '1' }, secret);
    const [sig, body] = signed.split('.');
    const tampered = `${sig}.${body}x`;
    expect(await parseSignedRequest(tampered, secret)).toBeNull();
  });

  it('rejects wrong app secret', async () => {
    const signed = await buildSignedRequest({ algorithm: 'HMAC-SHA256', user_id: '1' }, secret);
    expect(await parseSignedRequest(signed, 'other-secret')).toBeNull();
  });

  it('rejects unsupported algorithm', async () => {
    const signed = await buildSignedRequest({ algorithm: 'HMAC-SHA1', user_id: '1' }, secret);
    expect(await parseSignedRequest(signed, secret)).toBeNull();
  });

  it('rejects missing user_id / malformed input', async () => {
    const signed = await buildSignedRequest({ algorithm: 'HMAC-SHA256', user_id: '' }, secret);
    expect(await parseSignedRequest(signed, secret)).toBeNull();
    expect(await parseSignedRequest('', secret)).toBeNull();
    expect(await parseSignedRequest('no-dot', secret)).toBeNull();
  });
});
