export type {
  AutomationKind,
  AutomationLogEntry,
  AutomationPreference,
  BranchHealthAssessment,
  BranchHealthGrade,
  CeoRecommendationMemory,
  CoachMemoryEntry,
  CoachOrgIntelligence,
  CoachPriorityInsight,
  CoachRecommendationKind,
  ContactHeat,
  DailyCeoBriefing,
  EveningReport,
  FollowUpRecommendation,
  ManagerMessage,
  MessageDraft,
  MessageDraftKind,
  OnboardingLifecycleItem,
  OnboardingLifecycleStage,
  PersonCoachInsight,
} from './types';

export {
  assessBranchHealth,
  assessOrgHealth,
  buildCoachOrgIntelligence,
  buildDailyCeoBriefing,
  buildEveningReport,
  buildFollowUpRecommendations,
  buildManagerMessages,
  buildOnboardingLifecycle,
  buildPersonInsight,
  buildPriorities,
  isMorningWindow,
  selectSurfaceInsights,
} from './analyzeOrg';

export { buildMessageDraft, listMessageDraftKinds } from './messageDrafts';
export {
  defaultAutomationPreferences,
  disableAllAutomation,
  isAutomationEnabled,
  listAutomationLog,
  listAutomationPreferences,
  logAutomationEvent,
  setAutomationEnabled,
} from './automation';
export { forgetCoachFact, listCoachMemory, rememberCoachFact } from './memory';
export {
  formatApprovedKnowledgeContext,
  listApprovedKnowledgeForCoach,
  rememberApprovedArticle,
  syncApprovedKnowledgeFromArticles,
} from './approvedKnowledge';
export type { ApprovedKnowledgeSnapshot } from './approvedKnowledge';
export {
  buildBottlenecks,
  buildExecutiveIntelligence,
  buildFutureForecast,
  buildLeadershipDna,
  buildLeadershipScore,
  buildMomentumScore,
  buildRoiRecommendations,
  buildWhatHappened,
  buildWhatNext,
  buildWhatToday,
} from './executiveIntelligence';
export { ExecutiveIntelligencePanel } from './ExecutiveIntelligencePanel';
export type {
  BottleneckInsight,
  ExecutiveInsight,
  ExecutiveIntelligence,
  ForecastItem,
  LeadershipDnaTrait,
  RoiRecommendation,
  ScoredDimension,
  TimelineEvent,
} from './types';
export {
  filterManagerMessagesByMemory,
  listCeoRecommendationMemory,
  recordCeoRecommendation,
  shouldSurfaceRecommendation,
} from './ceoMemory';
export { PendingAscentVisionAnalyzer, defaultAscentVisionAnalyzer } from './visionContracts';
export type { AscentVisionAnalyzer, VisionScreenshotSummary } from './visionContracts';
export { mapGenealogyNodeToPartner } from './mapGenealogyPartner';
export { CoachBriefingPanel } from './CoachBriefingPanel';
export { CoachPersonInsightBubble } from './CoachPersonInsightBubble';
export { computeInsightPlacement } from './insightPlacement';
export type { InsightPlacement } from './insightPlacement';
export { findPersonInsight, useCoachOrgIntelligence } from './useCoachOrgIntelligence';
