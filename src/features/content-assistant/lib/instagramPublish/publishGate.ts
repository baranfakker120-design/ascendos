import { isInstagramPublishingEnabled } from '../../architecture/instagramArchitecture';
import { connectionHasPublishScope } from './graphPublish';

export type InstagramPublishGateReason =
  | 'ok'
  | 'not_connected'
  | 'draft_not_ready'
  | 'publishing_api_unavailable'
  | 'missing_publish_permission'
  | 'missing_media'
  | 'missing_caption';

export interface InstagramPublishGateInput {
  connected: boolean;
  draftReady: boolean;
  hasMedia: boolean;
  hasCaption: boolean;
  scopes?: string[] | null;
  /** Override for tests; defaults to architecture flag. */
  publishingEnabled?: boolean;
}

/**
 * Controlled publish gate — never auto-publishes.
 * Official Graph publishing requires connection + ready draft + confirm in UI.
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
  if (input.scopes && !connectionHasPublishScope(input.scopes)) {
    return 'missing_publish_permission';
  }
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
