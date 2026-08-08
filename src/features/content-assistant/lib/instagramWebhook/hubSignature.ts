/**
 * Isomorphic Meta webhook signature helpers for unit tests.
 * Keep in sync with `supabase/functions/_shared/meta/hubSignature.ts`.
 */

const textEncoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

export async function signHubBody(rawBody: string, appSecret: string): Promise<string> {
  const key = await importHmacKey(appSecret);
  const mac = await crypto.subtle.sign('HMAC', key, textEncoder.encode(rawBody));
  return `sha256=${toHex(new Uint8Array(mac))}`;
}

export async function verifyHubSignature256(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!appSecret || rawBody === undefined || rawBody === null) return false;
  if (!signatureHeader) return false;
  const match = /^sha256=([0-9a-fA-F]{64})$/.exec(signatureHeader.trim());
  if (!match) return false;
  const expected = match[1]!.toLowerCase();

  const key = await importHmacKey(appSecret);
  const mac = await crypto.subtle.sign('HMAC', key, textEncoder.encode(rawBody));
  const actual = toHex(new Uint8Array(mac));
  return timingSafeEqualHex(actual, expected);
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const aa = textEncoder.encode(a);
  const bb = textEncoder.encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) {
    diff |= aa[i]! ^ bb[i]!;
  }
  return diff === 0;
}
