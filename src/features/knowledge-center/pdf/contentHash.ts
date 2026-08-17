/**
 * Org-scoped PDF content hashing for Fast Scan (exact duplicate detection).
 * SHA-256 hex of raw file bytes — no AI, no network.
 */

export async function sha256HexOfBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return bytesToHex(new Uint8Array(digest));
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

export function normalizePdfFilename(name: string): string {
  return name.trim().toLowerCase();
}
