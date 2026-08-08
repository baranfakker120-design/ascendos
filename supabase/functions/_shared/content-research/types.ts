/**
 * Content hashtag research contracts (policy-safe).
 * No scraping, bots, passwords, or fake “trending” claims.
 */

export type ResearchProviderId = 'llm_analysis' | 'curated_catalog' | 'official_meta_hashtag';

export type ResearchSourceKind = 'asset_llm' | 'curated' | 'official_meta';

/** User-facing reason codes (map to i18n in the client). */
export type HashtagReasonCode =
  | 'theme_match'
  | 'high_relevance'
  | 'curated_catalog'
  | 'live_researched'
  | 'rejected_spam'
  | 'rejected_irrelevant'
  | 'rejected_duplicate'
  | 'low_context';

export interface ResearchProviderInfo {
  id: ResearchProviderId;
  kind: ResearchSourceKind | 'disabled';
  enabled: boolean;
  /** If false, results MUST NOT be labeled as live/trending. */
  claimsLiveTrends: boolean;
  description: string;
}

export interface ResearchInput {
  theme?: string | null;
  contentCategory?: string | null;
  mood?: string | null;
  visualSummary?: string | null;
  keywords?: string[];
  llmHashtags?: string[];
  locale?: string;
}

export interface HashtagCandidate {
  tag: string;
  source: ResearchSourceKind;
  score: number;
  reasonCode: HashtagReasonCode;
  rejected: boolean;
  rejectReason?: string;
}

export interface HashtagResearchResult {
  /** Final recommended tags (not rejected), highest score first. */
  recommended: HashtagCandidate[];
  /** Rejected / not recommended (for UI transparency). */
  rejected: HashtagCandidate[];
  providersUsed: ResearchProviderId[];
  /** True only when an enabled live provider contributed tags. */
  liveResearchActive: boolean;
  mode: 'curated_plus_llm' | 'llm_only' | 'insufficient_context';
  notes: string[];
}
