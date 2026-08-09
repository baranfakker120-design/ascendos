import { isInstagramPublishingEnabled } from '../../architecture/instagramArchitecture';

export type InstagramPublishGateReason =
  | 'ok'
  | 'not_connected'
  | 'draft_not_ready'
  | 'publishing_api_unavailable'
  | 'missing_media'
  | 'missing_caption';

export interface InstagramPublishGateInput {
  connected: boolean;
  draftReady: boolean;
  hasMedia: boolean;
  hasCaption: boolean;
  /** Override for tests; defaults to architecture flag. */
  publishingEnabled?: boolean;
}

/**
 * Controlled publish gate — never auto-publishes.
 * Official Graph publishing stays off until isInstagramPublishingEnabled() flips
 * and a dedicated publish Edge Function exists.
 */
export function evaluateInstagramPublishGate(
  input: InstagramPublishGateInput
): InstagramPublishGateReason {
  if (!input.connected) return 'not_connected';
  if (!input.draftReady) return 'draft_not_ready';
  if (!input.hasMedia) return 'missing_media';
  if (!input.hasCaption) return 'missing_caption';
  const enabled = input.publishingEnabled ?? isInstagramPublishingEnabled();
  if (!enabled) return 'publishing_api_unavailable';
  return 'ok';
}

export function formatHashtagsForDisplay(hashtags: string[]): string {
  return hashtags
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => (h.startsWith('#') ? h : `#${h}`))
    .join(' ');
}

export function buildInstagramCaptionPreview(caption: string, hashtags: string[]): string {
  const body = caption.trim();
  const tags = formatHashtagsForDisplay(hashtags);
  if (!body) return tags;
  if (!tags) return body;
  return `${body}\n\n${tags}`;
}
