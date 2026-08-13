/**
 * Client mirror of edge safeCopy — reject UUIDs / request IDs from public copy.
 */

/** UUID-shaped token (with dashes) — asset ids, request ids, filenames. */
export const INTERNAL_UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

const UUID_COMPACT_RE = /^[0-9a-f]{32}$/i;
const MEDIA_EXT_RE = /\.(jpe?g|png|webp|heic|gif|mp4|mov|webm)$/i;

/** True when the whole string is (or is a file named like) an internal id. */
export function looksLikeInternalId(value: string | null | undefined): boolean {
  if (value == null) return false;
  const s = String(value).trim();
  if (!s) return false;
  if (INTERNAL_UUID_RE.test(s) && s.replace(INTERNAL_UUID_RE, '').trim() === '') return true;
  const base = s.replace(MEDIA_EXT_RE, '').trim();
  if (INTERNAL_UUID_RE.test(base) && base.replace(INTERNAL_UUID_RE, '').trim() === '') return true;
  const compact = base.replace(/-/g, '');
  if (UUID_COMPACT_RE.test(compact)) return true;
  return false;
}

/** True when any UUID-shaped token appears inside free text. */
export function textContainsInternalId(value: string | null | undefined): boolean {
  if (value == null) return false;
  return INTERNAL_UUID_RE.test(String(value));
}

/** First candidate that is non-empty and not an internal id; else null. */
export function pickSafePublicCopy(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c).trim();
    if (!s) continue;
    if (looksLikeInternalId(s) || textContainsInternalId(s)) continue;
    return s;
  }
  return null;
}

/** Drop hashtag tokens that are UUIDs / internal ids. */
export function filterInternalIdHashtags(tags: readonly string[]): string[] {
  return tags.filter((t) => {
    const tag = String(t).trim().replace(/^#/, '');
    return tag.length > 0 && !looksLikeInternalId(tag) && !textContainsInternalId(tag);
  });
}
