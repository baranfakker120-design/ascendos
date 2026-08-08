/**
 * Isomorphic Meta `signed_request` helpers for unit tests.
 * Keep in sync with `supabase/functions/_shared/meta/signedRequest.ts`.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface MetaSignedRequestPayload {
  algorithm: string;
  user_id: string;
  issued_at?: number;
  expires?: number;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importHmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages
  );
}

/** Build a Meta-format signed_request for tests. */
export async function buildSignedRequest(
  payload: MetaSignedRequestPayload,
  appSecret: string
): Promise<string> {
  const encodedPayload = toBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(appSecret, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(encodedPayload));
  return `${toBase64Url(new Uint8Array(sig))}.${encodedPayload}`;
}

export async function parseSignedRequest(
  signedRequest: string,
  appSecret: string
): Promise<MetaSignedRequestPayload | null> {
  if (!signedRequest || !appSecret) return null;
  const dot = signedRequest.indexOf('.');
  if (dot <= 0 || dot === signedRequest.length - 1) return null;
  const encodedSig = signedRequest.slice(0, dot);
  const encodedPayload = signedRequest.slice(dot + 1);
  if (!encodedSig || !encodedPayload) return null;

  let sig: Uint8Array;
  try {
    sig = fromBase64Url(encodedSig);
  } catch {
    return null;
  }

  const key = await importHmacKey(appSecret, ['verify']);
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    sig.buffer as ArrayBuffer,
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
