/**
 * Sprint 5.2 — Executive Intelligence (virtual COO).
 * Pure analysis only. Every score ships with WHY. Additive to existing org intel.
 * Does not import analyzeOrg (avoids cycles) — callers pass health + priorities.
 */

import type {
  BranchHealthAssessment,
  BottleneckInsight,
  CoachOrgInput,
  CoachPriorityInsight,
  ExecutiveInsight,
  ExecutiveIntelligence,
  ForecastItem,
  LeadershipDnaTrait,
  RoiRecommendation,
  ScoredDimension,
  TimelineEvent,
} from './types';
import { createCoachTranslator, type CoachTranslateFn } from '../i18n';

const DEFAULT_T = createCoachTranslator('de');

function translator(input?: Pick<CoachOrgInput, 't'>, t?: CoachTranslateFn): CoachTranslateFn {
  return t ?? input?.t ?? DEFAULT_T;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function labelScore(score: number, t: CoachTranslateFn): string {
  if (score >= 85) return t('grade.excellent');
  if (score >= 70) return t('grade.strong');
  if (score >= 55) return t('grade.building');
  if (score >= 35) return t('grade.fragile');
  return t('grade.critical');
}

export function buildMomentumScore(
  input: CoachOrgInput,
  translate?: CoachTranslateFn
): ScoredDimension {
  const t = translator(input, translate);
  const d = input.dashboard;
  const why: string[] = [];
  const drivers: string[] = [];
  let score = 55;

  if (!d) {
    return {
      score: 50,
      label: labelScore(50, t),
      why: [t('executive.momentum.noData')],
      drivers: [],
    };
  }

  if (d.activeToday >= Math.max(2, Math.floor(d.directCount * 0.25))) {
    score += 14;
    why.push(t('executive.momentum.active', { count: d.activeToday }));
    drivers.push(t('executive.momentum.driverActivity'));
  } else if (d.activeToday === 0 && d.teamSize > 2) {
    score -= 12;
    why.push(t('executive.momentum.noActivity'));
  }

  if (d.tasksDoneToday > 0) {
    score += 8;
    why.push(t('executive.momentum.tasks', { count: d.tasksDoneToday }));
    drivers.push(t('executive.momentum.driverTasks'));
  }

  if (d.newRegistrationsMonth > 0) {
    score += 10;
    why.push(t('executive.momentum.registrations', { count: d.newRegistrationsMonth }));
    drivers.push(t('executive.momentum.driverRegistrations'));
  }

  const streakers = input.partners.filter((p) => p.depth >= 1 && p.streakDays >= 3).length;
  if (streakers > 0) {
    score += Math.min(12, streakers * 3);
    why.push(t('executive.momentum.streaks', { count: streakers }));
    drivers.push(t('executive.momentum.driverStreaks'));
  }

  if (d.inactive14d > 0 && d.teamSize > 0 && d.inactive14d / d.teamSize >= 0.35) {
    score -= 14;
    why.push(t('executive.momentum.inactive'));
  }

  score = clamp(score);
  return { score, label: labelScore(score, t), why: why.slice(0, 5), drivers };
}

export function buildLeadershipScore(
  input: CoachOrgInput,
  translate?: CoachTranslateFn
): ScoredDimension {
  const t = translator(input, translate);
  const d = input.dashboard;
  const why: string[] = [];
  const drivers: string[] = [];
  let score = 58;

  if (input.planDoneCount > 0) {
    score += 10;
    why.push(t('executive.leadership.missionsDone', { count: input.planDoneCount }));
    drivers.push(t('executive.leadership.driverExecution'));
  }
  if (input.planPendingCount > 3) {
    score -= 8;
    why.push(t('executive.leadership.missionsOpen', { count: input.planPendingCount }));
  }

  if (d && d.openFollowups === 0) {
    score += 10;
    why.push(t('executive.leadership.pipelineClean'));
    drivers.push(t('executive.leadership.driverPipeline'));
  } else if (d && d.openFollowups >= 5) {
    score -= 10;
    why.push(t('executive.leadership.followupsOpen', { count: d.openFollowups }));
  }

  if (input.teamLeader?.qualified) {
    score += 12;
    why.push(t('executive.leadership.qualified'));
    drivers.push(t('executive.leadership.driverQualification'));
  } else if (input.teamLeader) {
    const missing = Math.max(
      0,
      input.teamLeader.requiredFirstlines - input.teamLeader.activeFirstlines
    );
    if (missing <= 2) {
      score += 6;
      why.push(t('executive.leadership.nearQualification', { count: missing }));
      drivers.push(t('executive.leadership.driverQualificationPath'));
    }
  }

  const favorites = input.partners.filter((p) => p.isFavorite).length;
  if (favorites > 0) {
    score += 4;
    why.push(t('executive.leadership.focusPartners'));
    drivers.push(t('executive.leadership.driverFocus'));
  }

  if (input.pendingShareProofs > 0) {
    score -= 4;
    why.push(t('executive.leadership.pendingProofs'));
  }

  score = clamp(score);
  return { score, label: labelScore(score, t), why: why.slice(0, 5), drivers };
}

export function buildBottlenecks(
  input: CoachOrgInput,
  translate?: CoachTranslateFn
): BottleneckInsight[] {
  const t = translator(input, translate);
  const d = input.dashboard;
  const items: BottleneckInsight[] = [];

  if (d && d.openFollowups >= 3) {
    items.push({
      id: 'bn-followups',
      area: t('executive.bottleneck.pipelineArea'),
      title: t('executive.bottleneck.followupsTitle'),
      why: t('executive.bottleneck.followupsWhy', { count: d.openFollowups }),
      unlock: t('executive.bottleneck.followupsUnlock'),
    });
  }

  if (d && d.inactive14d >= 3) {
    items.push({
      id: 'bn-inactive',
      area: t('executive.bottleneck.activationArea'),
      title: t('executive.bottleneck.inactiveTitle'),
      why: t('executive.bottleneck.inactiveWhy', { count: d.inactive14d }),
      unlock: t('executive.bottleneck.inactiveUnlock'),
    });
  }

  const stuckOnboarding = input.partners.filter((p) => {
    if (p.depth !== 1) return false;
    const days = Math.floor((input.now.getTime() - new Date(p.joinedAt).getTime()) / 86_400_000);
    return days >= 3 && days <= 21 && p.apTotal < 50;
  });
  if (stuckOnboarding.length > 0) {
    items.push({
      id: 'bn-onboarding',
      area: t('executive.bottleneck.onboardingArea'),
      title: t('executive.bottleneck.onboardingTitle'),
      why: t('executive.bottleneck.onboardingWhy', { count: stuckOnboarding.length }),
      unlock: t('executive.bottleneck.onboardingUnlock', {
        name: stuckOnboarding[0].name.split(' ')[0] ?? stuckOnboarding[0].name,
      }),
    });
  }

  if (input.planPendingCount >= 4) {
    items.push({
      id: 'bn-focus',
      area: t('executive.bottleneck.focusArea'),
      title: t('executive.bottleneck.focusTitle'),
      why: t('executive.bottleneck.focusWhy', { count: input.planPendingCount }),
      unlock: t('executive.bottleneck.focusUnlock'),
    });
  }

  return items.slice(0, 5);
}

export function buildRoiRecommendations(
  input: CoachOrgInput,
  priorities: CoachPriorityInsight[],
  translate?: CoachTranslateFn
): RoiRecommendation[] {
  const t = translator(input, translate);
  const out: RoiRecommendation[] = [];
  for (const p of priorities.slice(0, 4)) {
    out.push({
      id: `roi-${p.id}`,
      action: p.title,
      why: p.why,
      expectedLift:
        p.severity === 'critical' || p.severity === 'high'
          ? t('executive.roi.highLift')
          : t('executive.roi.solidLift'),
    });
  }
  if (out.length === 0 && input.dashboard) {
    out.push({
      id: 'roi-default',
      action: t('executive.roi.defaultAction'),
      why: t('executive.roi.defaultWhy'),
      expectedLift: t('executive.roi.defaultLift'),
    });
  }
  return out.slice(0, 5);
}

export function buildLeadershipDna(
  input: CoachOrgInput,
  translate?: CoachTranslateFn
): LeadershipDnaTrait[] {
  const t = translator(input, translate);
  const traits: LeadershipDnaTrait[] = [];
  const d = input.dashboard;

  if (input.planDoneCount > 0) {
    traits.push({
      id: 'dna-exec',
      trait: t('executive.dna.executionTrait'),
      evidence: t('executive.dna.executionEvidence', { count: input.planDoneCount }),
      why: t('executive.dna.executionWhy'),
    });
  }
  if (d && d.openFollowups <= 2) {
    traits.push({
      id: 'dna-care',
      trait: t('executive.dna.careTrait'),
      evidence: t('executive.dna.careEvidence'),
      why: t('executive.dna.careWhy'),
    });
  }
  if (d && d.newRegistrationsMonth > 0) {
    traits.push({
      id: 'dna-growth',
      trait: t('executive.dna.growthTrait'),
      evidence: t('executive.dna.growthEvidence', { count: d.newRegistrationsMonth }),
      why: t('executive.dna.growthWhy'),
    });
  }
  const streakers = input.partners.filter((p) => p.streakDays >= 5).length;
  if (streakers > 0) {
    traits.push({
      id: 'dna-culture',
      trait: t('executive.dna.cultureTrait'),
      evidence: t('executive.dna.cultureEvidence', { count: streakers }),
      why: t('executive.dna.cultureWhy'),
    });
  }
  if (traits.length === 0) {
    traits.push({
      id: 'dna-base',
      trait: t('executive.dna.builderTrait'),
      evidence: t('executive.dna.builderEvidence'),
      why: t('executive.dna.builderWhy'),
    });
  }
  return traits.slice(0, 5);
}

export function buildExecutiveTimeline(
  input: CoachOrgInput,
  priorities: CoachPriorityInsight[],
  translate?: CoachTranslateFn
): TimelineEvent[] {
  const t = translator(input, translate);
  const events: TimelineEvent[] = [];
  const nowIso = input.now.toISOString();
  const d = input.dashboard;

  if (d && d.tasksDoneToday > 0) {
    events.push({
      id: 'tl-tasks',
      at: nowIso,
      title: t('executive.timeline.tasksTitle', { count: d.tasksDoneToday }),
      why: t('executive.timeline.tasksWhy'),
      kind: 'win',
    });
  }
  if (d && d.newRegistrationsMonth > 0) {
    events.push({
      id: 'tl-reg',
      at: nowIso,
      title: t('executive.timeline.registrationsTitle', { count: d.newRegistrationsMonth }),
      why: t('executive.timeline.registrationsWhy'),
      kind: 'win',
    });
  }
  if (d && d.inactive14d > 0) {
    events.push({
      id: 'tl-inactive',
      at: nowIso,
      title: t('executive.timeline.inactiveTitle', { count: d.inactive14d }),
      why: t('executive.timeline.inactiveWhy'),
      kind: 'risk',
    });
  }
  for (const p of priorities.slice(0, 2)) {
    events.push({
      id: `tl-${p.id}`,
      at: nowIso,
      title: p.title,
      why: p.why,
      kind: p.severity === 'critical' || p.severity === 'high' ? 'opportunity' : 'system',
    });
  }
  return events.slice(0, 8);
}

export function buildFutureForecast(
  input: CoachOrgInput,
  momentum: ScoredDimension,
  leadership: ScoredDimension,
  translate?: CoachTranslateFn
): ForecastItem[] {
  const t = translator(input, translate);
  const d = input.dashboard;
  const items: ForecastItem[] = [];

  items.push({
    id: 'fc-7d',
    horizon: '7d',
    title:
      momentum.score >= 65
        ? t('executive.forecast.sevenStrong')
        : t('executive.forecast.sevenActivation'),
    why: momentum.why[0] ?? t('executive.forecast.sevenWhy'),
    confidence: momentum.score >= 60 ? 'medium' : 'low',
  });

  items.push({
    id: 'fc-30d',
    horizon: '30d',
    title:
      (d?.newRegistrationsMonth ?? 0) > 0
        ? t('executive.forecast.thirtyGrowth')
        : t('executive.forecast.thirtyFocus'),
    why:
      (d?.newRegistrationsMonth ?? 0) > 0
        ? t('executive.forecast.thirtyGrowthWhy')
        : t('executive.forecast.thirtyFocusWhy'),
    confidence: 'medium',
  });

  items.push({
    id: 'fc-90d',
    horizon: '90d',
    title:
      leadership.score >= 70
        ? t('executive.forecast.ninetyScale')
        : t('executive.forecast.ninetyBuild'),
    why: leadership.why[0] ?? t('executive.forecast.ninetyWhy'),
    confidence: leadership.score >= 70 ? 'high' : 'medium',
  });

  return items;
}

export function buildWhatHappened(
  input: CoachOrgInput,
  translate?: CoachTranslateFn
): ExecutiveInsight[] {
  const t = translator(input, translate);
  const d = input.dashboard;
  const out: ExecutiveInsight[] = [];
  if (d) {
    out.push({
      id: 'wh-activity',
      headline: t('executive.happened.activityHeadline', {
        active: d.activeToday,
        tasks: d.tasksDoneToday,
      }),
      why: t('executive.happened.activityWhy'),
      severity: d.activeToday > 0 ? 'low' : 'medium',
    });
    out.push({
      id: 'wh-pipeline',
      headline: t('executive.happened.pipelineHeadline', {
        followups: d.openFollowups,
        inactive: d.inactive14d,
      }),
      why: t('executive.happened.pipelineWhy'),
      severity: d.openFollowups >= 5 || d.inactive14d >= 5 ? 'high' : 'medium',
    });
    if (d.newRegistrationsMonth > 0) {
      out.push({
        id: 'wh-growth',
        headline: t('executive.happened.growthHeadline', {
          count: d.newRegistrationsMonth,
        }),
        why: t('executive.happened.growthWhy'),
        severity: 'low',
      });
    }
  }
  return out.slice(0, 5);
}

export function buildWhatNext(
  priorities: CoachPriorityInsight[],
  forecast: ForecastItem[]
): ExecutiveInsight[] {
  const out: ExecutiveInsight[] = priorities.slice(0, 3).map((p) => ({
    id: `wn-${p.id}`,
    headline: p.title,
    why: p.why,
    severity: p.severity,
  }));
  if (forecast[0]) {
    out.push({
      id: 'wn-forecast',
      headline: forecast[0].title,
      why: forecast[0].why,
      severity: 'medium',
    });
  }
  return out.slice(0, 5);
}

export function buildWhatToday(priorities: CoachPriorityInsight[]): ExecutiveInsight[] {
  return priorities
    .filter((p) => p.severity === 'critical' || p.severity === 'high' || p.severity === 'medium')
    .slice(0, 4)
    .map((p) => ({
      id: `wt-${p.id}`,
      headline: p.title,
      why: p.why,
      severity: p.severity,
    }));
}

/** Full executive pack — always includes WHY, never scores/colors alone. */
export function buildExecutiveIntelligence(
  input: CoachOrgInput,
  branchHealth: BranchHealthAssessment,
  priorities: CoachPriorityInsight[],
  translate?: CoachTranslateFn
): ExecutiveIntelligence {
  const t = translator(input, translate);
  const momentum = buildMomentumScore(input, t);
  const leadership = buildLeadershipScore(input, t);
  const forecast = buildFutureForecast(input, momentum, leadership, t);
  const whatHappened = buildWhatHappened(input, t);
  const whatHappensNext = buildWhatNext(priorities, forecast);
  const whatToDoToday = buildWhatToday(priorities);

  const whyItMatters: ExecutiveInsight[] = [
    {
      id: 'why-health',
      headline: t('executive.matters.healthHeadline', {
        score: branchHealth.score,
        label: branchHealth.label,
      }),
      why: branchHealth.why[0] ?? t('executive.matters.healthWhy'),
      severity: branchHealth.score < 55 ? 'high' : 'medium',
    },
    {
      id: 'why-momentum',
      headline: t('executive.matters.momentumHeadline', {
        score: momentum.score,
        label: momentum.label,
      }),
      why: momentum.why[0] ?? t('executive.matters.momentumWhy'),
      severity: momentum.score < 55 ? 'high' : 'low',
    },
    {
      id: 'why-leadership',
      headline: t('executive.matters.leadershipHeadline', {
        score: leadership.score,
        label: leadership.label,
      }),
      why: leadership.why[0] ?? t('executive.matters.leadershipWhy'),
      severity: leadership.score < 55 ? 'medium' : 'low',
    },
  ];

  return {
    whatHappened,
    whyItMatters,
    whatHappensNext,
    whatToDoToday,
    momentum,
    leadership,
    branchHealth,
    bottlenecks: buildBottlenecks(input, t),
    roiRecommendations: buildRoiRecommendations(input, priorities, t),
    leadershipDna: buildLeadershipDna(input, t),
    timeline: buildExecutiveTimeline(input, priorities, t),
    forecast,
  };
}
