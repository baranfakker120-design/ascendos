/**
 * Meta / Facebook `signed_request` verification (HMAC-SHA256).
 * Format: `<base64url(sig)>.<base64url(payload-json)>`
 * Docs: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface MetaSignedRequestPayload {
  algorithm: string;
  user_id: string;
  issued_at?: number;
  expires?: number;
}

function fromBase64Url(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

/**
 * Verify and parse a Meta `signed_request`.
 * Returns null for missing/malformed/tampered input or unsupported algorithm.
 */
export async function parseSignedRequest(
  signedRequest: string,
  appSecret: string
): Promise<MetaSignedRequestPayload | null> {
  if (!signedRequest || !appSecret) return null;
  const dot = signedRequest.indexOf('.');
  if (dot <= 0 || dot === signedRequest.length - 1) return null;
  // Meta format: signature FIRST, then payload (unlike our OAuth state).
  const encodedSig = signedRequest.slice(0, dot);
  const encodedPayload = signedRequest.slice(dot + 1);
  if (!encodedSig || !encodedPayload) return null;

  let sig: Uint8Array;
  try {
    sig = fromBase64Url(encodedSig);
  } catch {
    return null;
  }

  const key = await importHmacKey(appSecret);
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    sig,
    textEncoder.encode(encodedPayload)
  );
  if (!ok) return null;

  try {
    const json = textDecoder.decode(fromBase64Url(encodedPayload));
    const data = JSON.parse(json) as MetaSignedRequestPayload;
    if (!data || typeof data !== 'object') return null;
    if (String(data.algorithm ?? '').toUpperCase() !== 'HMAC-SHA256') return null;
    if (!data.user_id || typeof data.user_id !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

/** Alphanumeric confirmation code for Meta (no symbols). */
export function generateConfirmationCode(bytes = 16): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rnd = crypto.getRandomValues(new Uint8Array(bytes));
  let out = '';
  for (let i = 0; i < rnd.length; i++) {
    out += alphabet[rnd[i]! % alphabet.length];
  }
  return out;
}
