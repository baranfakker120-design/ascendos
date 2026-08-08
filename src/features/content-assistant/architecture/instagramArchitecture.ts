/**
 * Instagram connection + publishing architecture (Phase 2 foundation).
 *
 * OFFICIAL PATH ONLY — Meta Graph / Instagram Content Publishing API.
 * Sources:
 * - https://developers.facebook.com/docs/instagram-platform/content-publishing
 * - https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/hashtag-search/
 * - https://developers.facebook.com/docs/development/terms-and-policies/automated-data-collection/
 *
 * Forbidden: password storage, scraping, browser bots, cookie hijacking,
 * click simulation, unofficial private APIs, shadowban “guarantees”.
 */

export const INSTAGRAM_ARCHITECTURE = {
  auth: 'oauth_only',
  publishing: 'meta_graph_content_publishing',
  mediaDelivery: 'signed_or_temporarily_fetchable_url',
  userConfirmRequired: true,
  storePasswords: false,
  storeTokensInClient: false,
} as const;

/** Product workflow (target). */
export type InstagramPublishFlowStep =
  | 'connect_instagram_oauth'
  | 'select_content'
  | 'review_caption'
  | 'review_keywords_hashtags'
  | 'user_confirm'
  | 'create_media_container'
  | 'media_publish'
  | 'record_attempt';

/**
 * TODO (Meta App Review / Phase 6) — do not workaround:
 * 1. Create Meta developer app + Business verification as required.
 * 2. Request Content Publishing permissions (Instagram Login or Facebook Login path).
 * 3. Optional: Instagram Public Content Access for Hashtag Search (30 unique / 7 days).
 * 4. Implement OAuth in Edge Function; persist only token_ref / vault reference
 *    in `content_instagram_connections` — never plaintext tokens in the Vite bundle.
 * 5. For publish, Meta must fetch media via URL — use short-lived signed URL or
 *    controlled temporary fetchable URL; bucket remains private by default.
 * 6. Enforce explicit `user_confirmed_at` before `content_publish_attempts` submit.
 * 7. Respect Meta rate limits (e.g. professional account publish caps).
 */
export const INSTAGRAM_META_APP_REVIEW_TODOS = [
  'meta_developer_app',
  'business_verification_if_required',
  'permissions_content_publish',
  'optional_public_content_access_hashtags',
  'oauth_edge_handler',
  'token_vault_ref_only',
  'signed_url_for_meta_fetch',
  'explicit_user_confirm',
  'rate_limit_handling',
] as const;

export function isInstagramPublishingEnabled(): boolean {
  // Foundation: UI + tables only. Enable after OAuth + App Review land.
  return false;
}
