/** Caption assembly for Graph media containers (no secrets). */

export function formatHashtagsForPublish(hashtags: string[] | null | undefined): string {
  return (hashtags ?? [])
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith('#') ? h : `#${h}`))
    .join(' ');
}

/**
 * Build the Instagram caption sent to Meta.
 * CTA is appended as plain text (organic posts have no separate CTA Graph field).
 */
export function buildPublishCaption(params: {
  caption: string | null | undefined;
  hashtags?: string[] | null;
  cta?: string | null;
}): string {
  const body = (params.caption ?? '').trim();
  const cta = (params.cta ?? '').trim();
  const tags = formatHashtagsForPublish(params.hashtags);
  const parts: string[] = [];
  if (body) parts.push(body);
  if (cta) parts.push(cta);
  if (tags) parts.push(tags);
  return parts.join('\n\n');
}
