/**
 * Allowed content-asset upload MIME types + iOS-safe resolution.
 * iPhone Camera/Photos often report MOV as `video/quicktime`, and Safari
 * sometimes omits `File.type` — then we fall back to a known extension only.
 */

export const CONTENT_ASSET_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const CONTENT_ASSET_VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;

export const CONTENT_ASSET_ALLOWED_MIMES = [
  ...CONTENT_ASSET_IMAGE_MIMES,
  ...CONTENT_ASSET_VIDEO_MIMES,
] as const;

/** HTML file input accept list (MIME + common extensions for iOS Safari). */
export const CONTENT_ASSET_FILE_ACCEPT = [
  ...CONTENT_ASSET_ALLOWED_MIMES,
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.mp4',
  '.m4v',
  '.mov',
  '.webm',
].join(',');

export type ContentAssetAllowedMime = (typeof CONTENT_ASSET_ALLOWED_MIMES)[number];

export function isAllowedContentAssetMime(mime: string | null | undefined): boolean {
  const m = (mime ?? '').trim().toLowerCase();
  return (CONTENT_ASSET_ALLOWED_MIMES as readonly string[]).includes(m);
}

/** Map a known filename extension to a canonical MIME (strict allowlist only). */
export function mimeFromFileName(
  fileName: string | null | undefined
): ContentAssetAllowedMime | null {
  const name = (fileName ?? '').trim().toLowerCase();
  if (!name.includes('.')) return null;
  const ext = name.slice(name.lastIndexOf('.') + 1);
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'webm':
      return 'video/webm';
    default:
      return null;
  }
}

/**
 * Resolve the MIME used for validation / storage / DB.
 * Prefer browser `File.type` when allowed; otherwise extension fallback.
 * Returns null → unsupported (caller throws unsupported_mime).
 */
export function resolveContentAssetUploadMime(file: {
  type?: string;
  name?: string;
}): ContentAssetAllowedMime | null {
  const reported = (file.type ?? '').trim().toLowerCase();
  if (isAllowedContentAssetMime(reported)) {
    return reported as ContentAssetAllowedMime;
  }
  // iOS Safari / Photos: empty or odd type with a known video/image extension.
  return mimeFromFileName(file.name);
}

export function extForContentAssetMime(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'video/webm':
      return 'webm';
    case 'video/mp4':
      return 'mp4';
    case 'video/quicktime':
      return 'mov';
    default:
      return 'jpg';
  }
}

export function mediaKindForContentAssetMime(mime: string): 'image' | 'video' {
  return mime.startsWith('video/') ? 'video' : 'image';
}
