/**
 * Hashtag / keyword research architecture (prepared for later phases).
 * Phase 3 uses asset-derived keywords/hashtags only — no Instagram scraping,
 * no unofficial APIs, no aggressive automated IG research.
 */

export const HASHTAG_RESEARCH_ARCHITECTURE = {
  phase3Mode: 'asset_derived_only',
  officialHashtagSearch: 'meta_graph_ig_hashtag_search',
  requiresAppReviewFeature: 'instagram_public_content_access',
  weeklyUniqueHashtagLimitHint: 30,
  scraping: false,
  bots: false,
  blackHat: false,
} as const;

export type HashtagResearchMode = 'asset_derived_only' | 'curated_seasonal' | 'meta_hashtag_api';
