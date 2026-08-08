export type {
  HashtagCandidate,
  HashtagReasonCode,
  HashtagResearchResult,
  ResearchInput,
  ResearchProviderId,
  ResearchProviderInfo,
  ResearchSourceKind,
} from './hashtagResearch/types';

export { CURATED_TOPICS, matchCuratedTopics } from './hashtagResearch/curatedCatalog';
export {
  RESEARCH_PROVIDERS,
  formatResearchPostingHint,
  runHashtagResearch,
} from './hashtagResearch/pipeline';

import type { HashtagReasonCode } from './hashtagResearch/types';

/** Maps reason codes to contentAssistant.* i18n keys. */
export function hashtagReasonI18nKey(
  code: HashtagReasonCode
):
  | 'contentAssistant.hashtagReasonTheme'
  | 'contentAssistant.hashtagReasonRelevance'
  | 'contentAssistant.hashtagReasonCurated'
  | 'contentAssistant.hashtagReasonLive'
  | 'contentAssistant.hashtagReasonRejectedSpam'
  | 'contentAssistant.hashtagReasonRejectedIrrelevant'
  | 'contentAssistant.hashtagReasonRejectedDuplicate'
  | 'contentAssistant.hashtagReasonLowContext' {
  switch (code) {
    case 'theme_match':
      return 'contentAssistant.hashtagReasonTheme';
    case 'high_relevance':
      return 'contentAssistant.hashtagReasonRelevance';
    case 'curated_catalog':
      return 'contentAssistant.hashtagReasonCurated';
    case 'live_researched':
      return 'contentAssistant.hashtagReasonLive';
    case 'rejected_spam':
      return 'contentAssistant.hashtagReasonRejectedSpam';
    case 'rejected_irrelevant':
      return 'contentAssistant.hashtagReasonRejectedIrrelevant';
    case 'rejected_duplicate':
      return 'contentAssistant.hashtagReasonRejectedDuplicate';
    case 'low_context':
      return 'contentAssistant.hashtagReasonLowContext';
  }
}
