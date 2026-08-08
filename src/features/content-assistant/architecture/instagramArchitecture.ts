/**
 * Instagram connection + publishing architecture.
 *
 * Phase 5A: Official OAuth connect only (Business Login for Instagram).
 * Publishing remains disabled until a later phase + Meta App Review.
 *
 * OFFICIAL PATH ONLY — Meta Graph / Instagram APIs.
 * Forbidden: password storage, scraping, browser bots, cookie hijacking,
 * click simulation, unofficial private APIs, shadowban “guarantees”.
 */

export const INSTAGRAM_ARCHITECTURE = {
  auth: 'oauth_only',
  loginPath: 'instagram_business_login',
  connectScope: 'instagram_business_basic',
  publishing: 'meta_graph_content_publishing',
  mediaDelivery: 'signed_or_temporarily_fetchable_url',
  userConfirmRequired: true,
  storePasswords: false,
  storeTokensInClient: false,
  edgeFunction: 'instagram-oauth',
  table: 'content_instagram_connections',
} as const;

/** Product workflow (target). Phase 5A implements only the first step. */
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
 * Meta App Review / Dashboard TODOs (human configuration — not automated):
 * 1. Create Meta developer app; add Instagram product.
 * 2. Configure Business Login for Instagram + Valid OAuth Redirect URIs.
 * 3. Set Edge secrets: META_APP_ID, META_APP_SECRET, META_REDIRECT_URI, APP_ORIGIN.
 * 4. Optional: META_TOKEN_ENCRYPTION_KEY (else app secret is used for AES-GCM).
 * 5. Request `instagram_business_basic` (connect). Publish scopes later.
 * 6. Business verification / App Review as required by Meta for production users.
 * 7. Publishing: `instagram_business_content_publish` + user confirm + rate limits.
 */
export const INSTAGRAM_META_APP_REVIEW_TODOS = [
  'meta_developer_app',
  'instagram_product_business_login',
  'oauth_redirect_uri',
  'edge_secrets_meta',
  'permission_instagram_business_basic',
  'business_verification_if_required',
  'app_review_for_production',
  'permissions_content_publish_later',
  'token_refresh_job_later',
  'signed_url_for_meta_fetch',
  'explicit_user_confirm',
  'rate_limit_handling',
] as const;

/** Phase 5A: OAuth connect UI/API is implemented; publishing stays off. */
export function isInstagramConnectEnabled(): boolean {
  return true;
}

export function isInstagramPublishingEnabled(): boolean {
  return false;
}
