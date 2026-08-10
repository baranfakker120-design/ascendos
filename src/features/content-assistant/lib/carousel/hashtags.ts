/** Product rule mirror — Instagram Content Assistant always stores exactly 5 hashtags. */
export const REQUIRED_HASHTAG_COUNT = 5;

export function enforceExactHashtagCount(
  tags: string[],
  extras: string[] = [],
  count = REQUIRED_HASHTAG_COUNT
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...tags, ...extras]) {
    const tag = raw.trim().replace(/^#/, '').toLowerCase();
    if (!tag || seen.has(tag)) continue;
    const original = raw.trim().replace(/^#/, '');
    seen.add(tag);
    out.push(original);
    if (out.length >= count) break;
  }
  let i = 1;
  while (out.length < count) {
    const pad = `ascendcontent${i}`;
    if (!seen.has(pad)) {
      seen.add(pad);
      out.push(pad);
    }
    i += 1;
  }
  return out.slice(0, count);
}
