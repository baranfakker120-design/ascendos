/**
 * Ascent Coach COO — domain types for organization intelligence.
 * Pure contracts only. No RPCs, schema, or genealogy engine coupling.
 */

export type BranchHealthGrade =
  'excellent' | 'healthy' | 'growing' | 'needs_attention' | 'critical';

export type InsightSeverity = 'critical' | 'high' | 'medium' | 'low';

export type CoachRecommendationKind =
  | 'call'
  | 'voice_message'
  | 'zoom'
  | 'presentation'
  | 'business_fit'
  | 'onboarding'
  | 'congratulation'
  | 'recognition'
  | 'reactivation'
  | 'promotion'
  | 'follow_up';

export type OnboardingLifecycleStage =
  | 'registered'
  | 'onboarding_sent'
  | 'opened'
  | 'completed'
  | 'austauschgruppe_joined'
  | 'nina_group_joined'
  | 'fully_onboarded';

export type ContactHeat = 'cold' | 'interested' | 'forgotten' | 'lost' | 'hot' | 'unknown';

export type MessageDraftKind =
  | 'welcome'
  | 'congratulations'
  | 'reminder'
  | 'reactivation'
  | 'follow_up'
  | 'onboarding'
  | 'zoom_invitation'
  | 'birthday'
  | 'qualification'
  | 'recognition';

export type AutomationKind =
  | 'reminders'
  | 'onboarding_reminders'
  | 'congratulations'
  | 'inactivity_reminders'
  | 'birthday_greetings'
  | 'follow_up_reminders';

/** Slim partner snapshot — mapped from existing genealogy/leadership data. */
export interface CoachPartnerSnapshot {
  membershipId: string;
  name: string;
  depth: number;
  apTotal: number;
  icpMonth: number;
  streakDays: number;
  directCount: number;
  teamCount: number;
  lastAppOpenedAt: string | null;
  joinedAt: string;
  rankLabel: string | null;
  isFavorite: boolean;
  sponsorMembershipId: string | null;
}

export interface CoachContactSnapshot {
  id: string;
  name: string;
  phase: string;
  lastEventAt: string | null;
  nextStep: string | null;
}

export interface CoachOrgDashboardSnapshot {
  activeToday: number;
  newRegistrationsMonth: number;
  openFollowups: number;
  teamAp: number;
  teamSize: number;
  directCount: number;
  inactive14d: number;
  tasksDoneToday: number;
  icpMonth: number;
  myApTotal: number;
}

export interface CoachWarningSnapshot {
  kind: string;
  membershipId: string;
  name: string;
  title: string;
  action: string;
}

export interface CoachInsightSnapshot {
  kind: string;
  emoji: string;
  title: string;
  membershipId: string;
  name: string;
  detail: string;
}

export interface CoachTeamLeaderSnapshot {
  activeFirstlines: number;
  requiredFirstlines: number;
  qualified: boolean;
}

export interface CoachOrgInput {
  now: Date;
  sponsorFirstName: string;
  dashboard: CoachOrgDashboardSnapshot | null;
  partners: CoachPartnerSnapshot[];
  contacts: CoachContactSnapshot[];
  warnings: CoachWarningSnapshot[];
  insights: CoachInsightSnapshot[];
  teamLeader: CoachTeamLeaderSnapshot | null;
  /** Pending share proofs count (AP integrity signal). */
  pendingShareProofs: number;
  planPendingCount: number;
  planDoneCount: number;
}

export interface BranchHealthAssessment {
  grade: BranchHealthGrade;
  score: number;
  why: string[];
  membershipId: string | null;
  label: string;
}

export interface CoachPriorityInsight {
  id: string;
  severity: InsightSeverity;
  title: string;
  why: string;
  recommendation: CoachRecommendationKind;
  targetName: string | null;
  targetMembershipId: string | null;
  targetContactId: string | null;
}

export interface DailyCeoBriefing {
  greeting: string;
  yesterdaySummary: string[];
  priorities: CoachPriorityInsight[];
  highestPriority: CoachPriorityInsight | null;
  teamHealth: BranchHealthAssessment;
  managerMessages: ManagerMessage[];
}

export interface EveningReport {
  greeting: string;
  todaysAp: number;
  todaysContactsTouched: number;
  todaysWins: string[];
  missedOpportunities: string[];
  tomorrowPriorities: string[];
  teamHealth: BranchHealthAssessment;
  managerMessages: ManagerMessage[];
}

/** Proactive Geschäftsführer notes — recommendations only, never auto-actions. */
export interface ManagerMessage {
  id: string;
  text: string;
  why: string;
  severity: InsightSeverity;
}

export interface PersonCoachInsight {
  membershipId: string;
  name: string;
  headline: string;
  bullets: string[];
  recommendation: CoachRecommendationKind | null;
  severity: InsightSeverity;
  currentSituation: string;
  nextBestAction: string;
  nextBestActionWhy: string;
  possibleObjection: string | null;
  suggestedWhatsApp: string;
  probabilityOfRegistration: number;
  probabilityOfInactivity: number;
  riskScore: number;
  strengths: string[];
  weaknesses: string[];
  sponsorRecommendation: string;
}

export interface OnboardingLifecycleItem {
  membershipId: string;
  name: string;
  stage: OnboardingLifecycleStage;
  stuckDays: number | null;
  needsHelp: boolean;
  note: string;
}

export interface FollowUpRecommendation {
  contactId: string;
  name: string;
  heat: ContactHeat;
  why: string;
  nextAction: CoachRecommendationKind;
}

export interface MessageDraft {
  kind: MessageDraftKind;
  title: string;
  body: string;
  requiresSponsorApproval: true;
}

export interface AutomationPreference {
  kind: AutomationKind;
  enabled: boolean;
}

export interface AutomationLogEntry {
  id: string;
  kind: AutomationKind;
  targetLabel: string;
  createdAt: string;
  preview: string;
}

export interface CoachMemoryEntry {
  id: string;
  contactId: string | null;
  membershipId: string | null;
  kind:
    | 'conversation'
    | 'follow_up'
    | 'objection'
    | 'promise'
    | 'meeting'
    | 'presentation'
    | 'zoom'
    | 'onboarding'
    | 'task';
  text: string;
  occurredAt: string;
  createdAt: string;
}

export type CeoMemoryOutcome = 'shown' | 'ignored' | 'solved' | 'improved';

export interface CeoRecommendationMemory {
  id: string;
  recommendationKey: string;
  text: string;
  outcome: CeoMemoryOutcome;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutiveInsight {
  id: string;
  headline: string;
  why: string;
  severity: InsightSeverity;
}

export interface ScoredDimension {
  score: number;
  label: string;
  why: string[];
  drivers: string[];
}

export interface BottleneckInsight {
  id: string;
  area: string;
  title: string;
  why: string;
  unlock: string;
}

export interface RoiRecommendation {
  id: string;
  action: string;
  why: string;
  expectedLift: string;
}

export interface LeadershipDnaTrait {
  id: string;
  trait: string;
  evidence: string;
  why: string;
}

export interface TimelineEvent {
  id: string;
  at: string;
  title: string;
  why: string;
  kind: 'win' | 'risk' | 'opportunity' | 'system';
}

export interface ForecastItem {
  id: string;
  horizon: '7d' | '30d' | '90d';
  title: string;
  why: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ExecutiveIntelligence {
  whatHappened: ExecutiveInsight[];
  whyItMatters: ExecutiveInsight[];
  whatHappensNext: ExecutiveInsight[];
  whatToDoToday: ExecutiveInsight[];
  momentum: ScoredDimension;
  leadership: ScoredDimension;
  branchHealth: BranchHealthAssessment;
  bottlenecks: BottleneckInsight[];
  roiRecommendations: RoiRecommendation[];
  leadershipDna: LeadershipDnaTrait[];
  timeline: TimelineEvent[];
  forecast: ForecastItem[];
}

export interface CoachOrgIntelligence {
  generatedAt: string;
  briefing: DailyCeoBriefing;
  evening: EveningReport;
  priorities: CoachPriorityInsight[];
  teamHealth: BranchHealthAssessment;
  branchHealth: BranchHealthAssessment[];
  personInsights: PersonCoachInsight[];
  onboarding: OnboardingLifecycleItem[];
  followUps: FollowUpRecommendation[];
  managerMessages: ManagerMessage[];
  /** High-value only — max handful for UI. */
  surfaceInsights: CoachPriorityInsight[];
  /** Virtual COO — scores always paired with WHY. */
  executive: ExecutiveIntelligence;
}
