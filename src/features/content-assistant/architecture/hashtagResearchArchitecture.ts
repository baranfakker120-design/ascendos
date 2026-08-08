/**
 * Hashtag / keyword research architecture (Phase 3).
 *
 * Pipeline: theme from asset → search terms → providers → score → clean check.
 * Providers today: llm_analysis + curated_catalog.
 * Reserved (disabled): official Meta IG Hashtag Search after App Review.
 *
 * Forbidden: scraping, bots, password login, fake engagement, invented “viral now” tags.
 */

import { RESEARCH_PROVIDERS } from '../lib/hashtagResearch';

export const HASHTAG_RESEARCH_ARCHITECTURE = {
  pipeline: [
    'detect_theme_from_asset',
    'derive_search_terms',
    'provider_llm_analysis',
    'provider_curated_catalog',
    'provider_official_meta_disabled',
    'score_and_filter',
    'clean_check',
    'attach_to_draft',
  ] as const,
  providers: RESEARCH_PROVIDERS,
  officialHashtagSearch: 'meta_graph_ig_hashtag_search',
  requiresAppReviewFeature: 'instagram_public_content_access',
  weeklyUniqueHashtagLimitHint: 30,
  scraping: false,
  bots: false,
  blackHat: false,
  /** Product rule: never claim trending unless liveResearchActive === true. */
  allowTrendingClaimsWithoutLiveSource: false,
} as const;

export type HashtagResearchMode = 'curated_plus_llm' | 'llm_only' | 'insufficient_context';
