import type {
  BranchHealthAssessment,
  BranchHealthGrade,
  CoachContactSnapshot,
  CoachOrgInput,
  CoachOrgIntelligence,
  CoachPartnerSnapshot,
  CoachPriorityInsight,
  ContactHeat,
  DailyCeoBriefing,
  EveningReport,
  FollowUpRecommendation,
  InsightSeverity,
  ManagerMessage,
  OnboardingLifecycleItem,
  PersonCoachInsight,
} from './types';
import { buildExecutiveIntelligence } from './executiveIntelligence';
import { createCoachTranslator, type CoachTranslateFn } from '../i18n';

const DAY_MS = 86_400_000;
const DEFAULT_T = createCoachTranslator('de');

function translator(input?: Pick<CoachOrgInput, 't'>, t?: CoachTranslateFn): CoachTranslateFn {
  return t ?? input?.t ?? DEFAULT_T;
}

function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / DAY_MS);
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function gradeFromScore(score: number): BranchHealthGrade {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'healthy';
  if (score >= 55) return 'growing';
  if (score >= 35) return 'needs_attention';
  return 'critical';
}

function gradeLabel(grade: BranchHealthGrade, t: CoachTranslateFn): string {
  switch (grade) {
    case 'excellent':
      return t('grade.excellent');
    case 'healthy':
      return t('grade.healthy');
    case 'growing':
      return t('grade.growing');
    case 'needs_attention':
      return t('grade.needsAttention');
    case 'critical':
      return t('grade.critical');
  }
}

/** Org-wide branch health with explicit WHY (never color-only). */
export function assessOrgHealth(input: CoachOrgInput): BranchHealthAssessment {
  const t = translator(input);
  const d = input.dashboard;
  const why: string[] = [];
  let score = 70;

  if (!d) {
    return {
      grade: 'growing',
      score: 50,
      why: [t('health.org.noData')],
      membershipId: null,
      label: gradeLabel('growing', t),
    };
  }

  const inactiveRatio = d.teamSize > 0 ? d.inactive14d / d.teamSize : 0;
  if (inactiveRatio >= 0.4) {
    score -= 30;
    why.push(t('health.org.inactiveHigh', { count: d.inactive14d }));
  } else if (inactiveRatio >= 0.2) {
    score -= 15;
    why.push(t('health.org.inactiveMedium', { count: d.inactive14d }));
  } else {
    score += 8;
    why.push(t('health.org.inactiveLow'));
  }

  if (d.openFollowups >= 8) {
    score -= 18;
    why.push(t('health.org.followupsHigh', { count: d.openFollowups }));
  } else if (d.openFollowups >= 3) {
    score -= 8;
    why.push(t('health.org.followupsMedium', { count: d.openFollowups }));
  } else if (d.openFollowups === 0) {
    score += 6;
    why.push(t('health.org.followupsNone'));
  }

  if (d.newRegistrationsMonth >= 3) {
    score += 10;
    why.push(t('health.org.registrationsGrowth', { count: d.newRegistrationsMonth }));
  } else if (d.newRegistrationsMonth === 0 && d.teamSize > 3) {
    score -= 8;
    why.push(t('health.org.registrationsNone'));
  }

  if (d.activeToday >= Math.max(2, Math.floor(d.directCount * 0.3))) {
    score += 8;
    why.push(t('health.org.activeToday', { count: d.activeToday }));
  }

  if (input.teamLeader && !input.teamLeader.qualified) {
    const missing = Math.max(
      0,
      input.teamLeader.requiredFirstlines - input.teamLeader.activeFirstlines
    );
    if (missing > 0 && missing <= 2) {
      score += 4;
      why.push(t('health.org.teamLeaderNear', { count: missing }));
    }
  }

  if (input.pendingShareProofs > 0) {
    why.push(t('health.org.pendingProofs', { count: input.pendingShareProofs }));
  }

  score = clampScore(score);
  const grade = gradeFromScore(score);
  if (why.length === 0) why.push(t('health.org.stable'));

  return {
    grade,
    score,
    why: why.slice(0, 4),
    membershipId: null,
    label: gradeLabel(grade, t),
  };
}

/** Per-direct-line health for firstline branches. */
export function assessBranchHealth(
  partners: CoachPartnerSnapshot[],
  now: Date,
  translate?: CoachTranslateFn
): BranchHealthAssessment[] {
  const t = translator(undefined, translate);
  const directs = partners.filter((p) => p.depth === 1);
  return directs.map((lead) => {
    const downline = partners.filter(
      (p) => p.sponsorMembershipId === lead.membershipId || p.membershipId === lead.membershipId
    );
    const why: string[] = [];
    let score = 65;

    const inactive = downline.filter((p) => {
      const d = daysSince(p.lastAppOpenedAt, now);
      return d === null || d >= 14;
    }).length;
    if (inactive >= 2) {
      score -= 20;
      why.push(t('health.branch.inactive', { count: inactive }));
    }

    if (lead.streakDays >= 5) {
      score += 12;
      why.push(t('health.branch.strongStreak', { name: lead.name, days: lead.streakDays }));
    } else if (lead.streakDays === 0) {
      score -= 10;
      why.push(t('health.branch.noStreak', { name: lead.name }));
    }

    if (lead.icpMonth > 0) {
      score += 8;
      why.push(t('health.branch.producing', { count: lead.icpMonth }));
    }

    const newest = daysSince(lead.joinedAt, now);
    if (newest !== null && newest <= 14 && lead.directCount === 0) {
      score -= 5;
      why.push(t('health.branch.newWithoutTeam'));
    }

    if (why.length === 0) why.push(t('health.branch.stable'));
    score = clampScore(score);
    const grade = gradeFromScore(score);
    return {
      grade,
      score,
      why: why.slice(0, 3),
      membershipId: lead.membershipId,
      label: t('health.branch.label', { name: lead.name, grade: gradeLabel(grade, t) }),
    };
  });
}

export function buildPersonInsight(
  partner: CoachPartnerSnapshot,
  now: Date,
  org?: {
    siblings?: CoachPartnerSnapshot[];
    directsNeedingHelp?: number;
    onboardingUrl?: string | null;
  },
  translate?: CoachTranslateFn
): PersonCoachInsight {
  const t = translator(undefined, translate);
  const idle = daysSince(partner.lastAppOpenedAt, now);
  const tenure = daysSince(partner.joinedAt, now) ?? 0;
  const bullets: string[] = [];
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  let headline = t('person.default.headline');
  let severity: InsightSeverity = 'low';
  let recommendation: PersonCoachInsight['recommendation'] = null;
  let currentSituation = t('person.default.situation', { name: partner.name });
  let nextBestAction = t('person.default.action');
  let nextBestActionWhy = t('person.default.why');
  let possibleObjection: string | null = null;
  let probabilityOfRegistration = 35;
  let probabilityOfInactivity = 25;
  let riskScore = 20;

  if (idle === null || idle >= 14) {
    headline =
      idle === null
        ? t('person.inactive.headlineNever')
        : t('person.inactive.headlineDays', { days: idle });
    currentSituation =
      idle === null
        ? t('person.inactive.situationNever', { name: partner.name })
        : t('person.inactive.situationDays', { name: partner.name, days: idle });
    bullets.push(t('person.inactive.bullet'));
    recommendation = 'reactivation';
    severity = 'high';
    nextBestAction = t('person.inactive.action');
    nextBestActionWhy =
      idle === null
        ? t('person.inactive.whyNever', { name: partner.name })
        : t('person.inactive.whyDays', { name: partner.name, days: idle });
    possibleObjection = t('person.inactive.objection');
    weaknesses.push(t('person.inactive.weakness'));
    probabilityOfInactivity = idle === null ? 80 : Math.min(95, 50 + idle);
    probabilityOfRegistration = 15;
    riskScore = Math.min(95, 55 + (idle ?? 20));
  } else if (idle >= 6) {
    headline = t('person.slowing.headline', { days: idle });
    currentSituation = t('person.slowing.situation', { name: partner.name, days: idle });
    bullets.push(t('person.slowing.bullet'));
    recommendation = 'voice_message';
    severity = 'medium';
    nextBestAction = t('person.slowing.action', { name: partner.name });
    nextBestActionWhy = org?.directsNeedingHelp
      ? t('person.slowing.whyWithOnboarding', {
          name: partner.name,
          days: idle,
          count: org.directsNeedingHelp,
        })
      : t('person.slowing.why', { name: partner.name, days: idle });
    possibleObjection = t('person.slowing.objection');
    weaknesses.push(t('person.slowing.weakness'));
    probabilityOfInactivity = 55 + idle;
    riskScore = 40 + idle * 2;
  } else if (partner.streakDays >= 1 && partner.streakDays <= 2 && tenure > 14) {
    headline = t('person.streakRisk.headline');
    currentSituation = t('person.streakRisk.situation', {
      name: partner.name,
      days: partner.streakDays,
    });
    recommendation = 'recognition';
    severity = 'medium';
    nextBestAction = t('person.streakRisk.action');
    nextBestActionWhy = t('person.streakRisk.why', { days: partner.streakDays });
    weaknesses.push(t('person.streakRisk.weakness'));
    probabilityOfInactivity = 45;
    riskScore = 35;
  } else if (partner.streakDays >= 7) {
    headline = t('person.active.headline');
    currentSituation = t('person.active.situation', {
      name: partner.name,
      days: partner.streakDays,
    });
    bullets.push(t('person.active.bullet', { days: partner.streakDays }));
    recommendation = 'recognition';
    severity = 'low';
    strengths.push(t('person.active.strengthConsistency'), t('person.active.strengthExample'));
    nextBestAction = t('person.active.action');
    nextBestActionWhy = t('person.active.why');
    probabilityOfInactivity = 10;
    probabilityOfRegistration = 55;
    riskScore = 10;
  } else if (tenure <= 14) {
    headline = t('person.newConsultant.headline');
    currentSituation = t('person.newConsultant.situation', {
      name: partner.name,
      days: tenure,
    });
    bullets.push(t('person.newConsultant.bullet'));
    recommendation = 'onboarding';
    severity = 'medium';
    nextBestAction = t('person.newConsultant.action');
    nextBestActionWhy = t('person.newConsultant.why');
    possibleObjection = t('person.newConsultant.objection');
    weaknesses.push(t('person.newConsultant.weakness'));
    probabilityOfRegistration = 70;
    probabilityOfInactivity = 40;
    riskScore = 30;
  } else if (partner.directCount >= 3 && partner.streakDays >= 3) {
    headline = t('person.leadership.headline');
    currentSituation = t('person.leadership.situation', {
      name: partner.name,
      count: partner.directCount,
    });
    bullets.push(t('person.leadership.bullet'));
    recommendation = 'promotion';
    severity = 'medium';
    strengths.push(t('person.leadership.strengthGrowth'), t('person.leadership.strengthActive'));
    nextBestAction = t('person.leadership.action');
    nextBestActionWhy = t('person.leadership.why');
    probabilityOfRegistration = 60;
    probabilityOfInactivity = 15;
    riskScore = 15;
  } else if (partner.icpMonth > 0 && partner.streakDays >= 3) {
    headline = t('person.momentum.headline');
    currentSituation = t('person.momentum.situation', {
      name: partner.name,
      count: partner.icpMonth,
    });
    bullets.push(t('person.momentum.bullet'));
    recommendation = 'congratulation';
    severity = 'low';
    strengths.push(t('person.momentum.strength'));
    nextBestAction = t('person.momentum.action');
    nextBestActionWhy = t('person.momentum.why');
    probabilityOfInactivity = 18;
    riskScore = 12;
  }

  if (partner.apTotal > 0) {
    bullets.push(t('person.metrics.apTotal', { count: partner.apTotal }));
    if (partner.apTotal >= 250) strengths.push(t('person.metrics.strengthAp'));
  }
  if (partner.rankLabel) bullets.push(t('person.metrics.rank', { rank: partner.rankLabel }));
  if (partner.directCount >= 5) strengths.push(t('person.metrics.strengthFirstline'));
  if (partner.teamCount === 0 && tenure > 21) weaknesses.push(t('person.metrics.weaknessNoTeam'));

  const first = partner.name.split(' ')[0] || partner.name;
  const onboardingUrl = (org?.onboardingUrl ?? '').trim();
  const onboardingUrlSuffix = onboardingUrl ? `: ${onboardingUrl}` : '';
  const suggestedWhatsApp =
    recommendation === 'onboarding'
      ? t('person.message.onboarding', { name: first, onboardingUrl: onboardingUrlSuffix })
      : recommendation === 'reactivation' || recommendation === 'voice_message'
        ? t('person.message.reactivation', { name: first })
        : recommendation === 'recognition' || recommendation === 'congratulation'
          ? t('person.message.recognition', { name: first })
          : t('person.message.checkIn', { name: first });

  const sponsorRecommendation = nextBestActionWhy;

  return {
    membershipId: partner.membershipId,
    name: partner.name,
    headline,
    bullets: bullets.slice(0, 4),
    recommendation,
    severity,
    currentSituation,
    nextBestAction,
    nextBestActionWhy,
    possibleObjection,
    suggestedWhatsApp,
    probabilityOfRegistration: Math.max(0, Math.min(100, Math.round(probabilityOfRegistration))),
    probabilityOfInactivity: Math.max(0, Math.min(100, Math.round(probabilityOfInactivity))),
    riskScore: Math.max(0, Math.min(100, Math.round(riskScore))),
    strengths: strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 4),
    sponsorRecommendation,
  };
}

function contactHeat(contact: CoachContactSnapshot, now: Date): ContactHeat {
  const idle = daysSince(contact.lastEventAt, now);
  if (contact.phase === 'partner' || contact.phase === 'kunde') return 'interested';
  if (
    contact.phase === 'fit_check' ||
    contact.phase === 'three_way_call' ||
    contact.phase === 'praesentation'
  ) {
    return idle !== null && idle <= 3 ? 'hot' : 'interested';
  }
  if (idle === null) return 'cold';
  if (idle >= 30) return 'lost';
  if (idle >= 14) return 'forgotten';
  if (idle >= 7) return 'cold';
  if (contact.phase === 'im_gespraech' || contact.phase === 'praesentation_offen') {
    return 'interested';
  }
  return 'unknown';
}

export function buildFollowUpRecommendations(
  contacts: CoachContactSnapshot[],
  now: Date,
  translate?: CoachTranslateFn
): FollowUpRecommendation[] {
  const t = translator(undefined, translate);
  const out: FollowUpRecommendation[] = [];
  for (const c of contacts) {
    const heat = contactHeat(c, now);
    const idle = daysSince(c.lastEventAt, now);
    if (heat === 'hot') {
      out.push({
        contactId: c.id,
        name: c.name,
        heat,
        why: t('followUp.hot'),
        nextAction: 'call',
      });
    } else if (heat === 'forgotten') {
      out.push({
        contactId: c.id,
        name: c.name,
        heat,
        why: t('followUp.forgotten', { days: idle ?? '?' }),
        nextAction: 'follow_up',
      });
    } else if (heat === 'lost') {
      out.push({
        contactId: c.id,
        name: c.name,
        heat,
        why: t('followUp.lost'),
        nextAction: 'reactivation',
      });
    } else if (heat === 'interested' && idle !== null && idle >= 3) {
      out.push({
        contactId: c.id,
        name: c.name,
        heat,
        why: c.nextStep || t('followUp.interested'),
        nextAction: 'follow_up',
      });
    }
  }
  return out
    .sort((a, b) => {
      const rank: Record<ContactHeat, number> = {
        hot: 0,
        forgotten: 1,
        interested: 2,
        lost: 3,
        cold: 4,
        unknown: 5,
      };
      return rank[a.heat] - rank[b.heat];
    })
    .slice(0, 12);
}

export function buildOnboardingLifecycle(
  partners: CoachPartnerSnapshot[],
  now: Date,
  translate?: CoachTranslateFn
): OnboardingLifecycleItem[] {
  const t = translator(undefined, translate);
  return partners
    .filter((p) => {
      const tenure = daysSince(p.joinedAt, now);
      return tenure !== null && tenure <= 30;
    })
    .map((p) => {
      const tenure = daysSince(p.joinedAt, now) ?? 0;
      const idle = daysSince(p.lastAppOpenedAt, now);
      let stage: OnboardingLifecycleItem['stage'] = 'registered';
      let needsHelp = tenure >= 3;
      let note = t('onboarding.registered');

      if (idle !== null && idle <= 2 && tenure >= 1) {
        stage = 'opened';
        needsHelp = false;
        note = t('onboarding.opened');
      }
      if (p.streakDays >= 3 && p.directCount === 0) {
        stage = 'completed';
        needsHelp = false;
        note = t('onboarding.completed');
      }
      if (p.directCount > 0 || (p.streakDays >= 5 && tenure >= 7)) {
        stage = 'fully_onboarded';
        needsHelp = false;
        note = t('onboarding.fullyOnboarded');
      }
      if (idle === null || (idle !== null && idle >= 7 && tenure <= 21)) {
        needsHelp = true;
        note = t('onboarding.stuck');
      }

      return {
        membershipId: p.membershipId,
        name: p.name,
        stage,
        stuckDays: needsHelp ? idle : null,
        needsHelp,
        note,
      };
    })
    .slice(0, 20);
}

function severityRank(s: InsightSeverity): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[s];
}

export function buildPriorities(input: CoachOrgInput): CoachPriorityInsight[] {
  const t = translator(input);
  const items: CoachPriorityInsight[] = [];
  const now = input.now;

  for (const w of input.warnings.slice(0, 8)) {
    // Localize by kind so RPC German copy never leaks into Coach UI.
    const titleKey = `warning.${w.kind}.title`;
    const actionKey = `warning.${w.kind}.action`;
    const localizedTitle = t(titleKey);
    const localizedAction = t(actionKey);
    items.push({
      id: `warn-${w.membershipId}-${w.kind}`,
      severity:
        w.kind.includes('inactive') || w.kind.includes('critical') || w.kind.includes('30d')
          ? 'high'
          : 'medium',
      title: localizedTitle !== titleKey ? localizedTitle : w.title,
      why: localizedAction !== actionKey ? localizedAction : w.action,
      recommendation:
        w.kind.includes('inactive') || w.kind.includes('no_activity') || w.kind.includes('30d')
          ? 'reactivation'
          : 'follow_up',
      targetName: w.name,
      targetMembershipId: w.membershipId,
      targetContactId: null,
    });
  }

  for (const fu of buildFollowUpRecommendations(input.contacts, now, t).slice(0, 5)) {
    items.push({
      id: `fu-${fu.contactId}`,
      severity: fu.heat === 'hot' ? 'critical' : fu.heat === 'forgotten' ? 'high' : 'medium',
      title:
        fu.heat === 'hot'
          ? t('priority.call', { name: fu.name })
          : fu.heat === 'forgotten'
            ? t('priority.followUp', { name: fu.name })
            : t('priority.needsTouch', { name: fu.name }),
      why: fu.why,
      recommendation: fu.nextAction,
      targetName: fu.name,
      targetMembershipId: null,
      targetContactId: fu.contactId,
    });
  }

  for (const ob of buildOnboardingLifecycle(input.partners, now, t).filter((x) => x.needsHelp)) {
    items.push({
      id: `onb-${ob.membershipId}`,
      severity: 'high',
      title: t('priority.onboardingHelp', { name: ob.name }),
      why: ob.note,
      recommendation: 'onboarding',
      targetName: ob.name,
      targetMembershipId: ob.membershipId,
      targetContactId: null,
    });
  }

  if (input.teamLeader && !input.teamLeader.qualified) {
    const missing = Math.max(
      0,
      input.teamLeader.requiredFirstlines - input.teamLeader.activeFirstlines
    );
    if (missing > 0 && missing <= 2) {
      items.push({
        id: 'tl-close',
        severity: 'medium',
        title: t('priority.teamLeaderNearTitle', { count: missing }),
        why: t('priority.teamLeaderNearWhy'),
        recommendation: 'recognition',
        targetName: null,
        targetMembershipId: null,
        targetContactId: null,
      });
    }
  }

  if (input.pendingShareProofs > 0) {
    items.push({
      id: 'ap-pending',
      severity: 'medium',
      title: t('priority.pendingProofsTitle', { count: input.pendingShareProofs }),
      why: t('priority.pendingProofsWhy'),
      recommendation: 'follow_up',
      targetName: null,
      targetMembershipId: null,
      targetContactId: null,
    });
  }

  if (input.planPendingCount > 0 && input.planDoneCount === 0) {
    items.push({
      id: 'plan-start',
      severity: 'medium',
      title: t('priority.planTitle'),
      why: t('priority.planWhy', { count: input.planPendingCount }),
      recommendation: 'call',
      targetName: null,
      targetMembershipId: null,
      targetContactId: null,
    });
  }

  // Streak loss / encouragement
  for (const p of input.partners) {
    if (p.depth < 1) continue;
    if (p.streakDays >= 1 && p.streakDays <= 2) {
      items.push({
        id: `streak-${p.membershipId}`,
        severity: 'medium',
        title: t('priority.encouragementTitle', { name: p.name }),
        why: t('priority.encouragementWhy', { days: p.streakDays }),
        recommendation: 'recognition',
        targetName: p.name,
        targetMembershipId: p.membershipId,
        targetContactId: null,
      });
    }
  }

  // Strongest / weakest firstline legs (depth 1)
  const directs = input.partners.filter((p) => p.depth === 1);
  if (directs.length >= 2) {
    const ranked = [...directs].sort(
      (a, b) => b.icpMonth + b.streakDays * 2 - (a.icpMonth + a.streakDays * 2)
    );
    const strong = ranked[0]!;
    const weak = ranked[ranked.length - 1]!;
    if (strong.membershipId !== weak.membershipId) {
      items.push({
        id: `leg-strong-${strong.membershipId}`,
        severity: 'low',
        title: t('priority.strongLegTitle', { name: strong.name }),
        why: t('priority.strongLegWhy', { strong: strong.name, weak: weak.name }),
        recommendation: 'recognition',
        targetName: strong.name,
        targetMembershipId: strong.membershipId,
        targetContactId: null,
      });
      const weakIdle = daysSince(weak.lastAppOpenedAt, now);
      if (weakIdle === null || weakIdle >= 6 || weak.icpMonth === 0) {
        items.push({
          id: `leg-weak-${weak.membershipId}`,
          severity: 'high',
          title: t('priority.weakLegTitle', { name: weak.name }),
          why: t('priority.weakLegWhy', { name: weak.name }),
          recommendation: 'reactivation',
          targetName: weak.name,
          targetMembershipId: weak.membershipId,
          targetContactId: null,
        });
      }
    }
  }

  return items.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).slice(0, 20);
}

/** Proactive manager messages — occasional, high-value, always with WHY. */
export function buildManagerMessages(
  input: CoachOrgInput,
  priorities: CoachPriorityInsight[],
  teamHealth: BranchHealthAssessment
): ManagerMessage[] {
  const t = translator(input);
  const msgs: ManagerMessage[] = [];
  const forgotten = buildFollowUpRecommendations(input.contacts, input.now, t).filter(
    (f) => f.heat === 'forgotten' || f.heat === 'hot'
  );
  if (forgotten.length >= 1) {
    const hot = forgotten.find((f) => f.heat === 'hot');
    if (hot) {
      msgs.push({
        id: `mgr-call-${hot.contactId}`,
        text: t('manager.callToday', { name: hot.name }),
        why: hot.why,
        severity: 'critical',
      });
    }
    const forg = forgotten.filter((f) => f.heat === 'forgotten');
    if (forg.length >= 3) {
      msgs.push({
        id: 'mgr-fu-many',
        text: t('manager.manyFollowups', { count: forg.length }),
        why: t('manager.manyFollowupsWhy'),
        severity: 'high',
      });
    } else if (forg[0]) {
      msgs.push({
        id: `mgr-fu-${forg[0].contactId}`,
        text: t('manager.ignoredContact', { name: forg[0].name }),
        why: forg[0].why,
        severity: 'high',
      });
    }
  }

  const onboardingGaps = buildOnboardingLifecycle(input.partners, input.now, t).filter(
    (x) => x.needsHelp
  );
  if (onboardingGaps.length >= 1) {
    msgs.push({
      id: 'mgr-onb-gaps',
      text:
        onboardingGaps.length === 1
          ? t('manager.oneOnboardingGap', { name: onboardingGaps[0]!.name })
          : t('manager.manyOnboardingGaps', { count: onboardingGaps.length }),
      why: t('manager.onboardingWhy'),
      severity: 'high',
    });
  }

  if (input.teamLeader && !input.teamLeader.qualified) {
    const missing = Math.max(
      0,
      input.teamLeader.requiredFirstlines - input.teamLeader.activeFirstlines
    );
    if (missing > 0 && missing <= 2) {
      msgs.push({
        id: 'mgr-tl',
        text: t('manager.teamLeaderNear', { count: missing }),
        why: t('manager.teamLeaderWhy'),
        severity: 'medium',
      });
    }
  }

  if (input.pendingShareProofs > 0) {
    msgs.push({
      id: 'mgr-ap',
      text: t('manager.pendingProofs', { count: input.pendingShareProofs }),
      why: t('manager.pendingProofsWhy'),
      severity: 'medium',
    });
  }

  const directs = input.partners.filter((p) => p.depth === 1);
  if (directs.length >= 2) {
    const ranked = [...directs].sort(
      (a, b) => b.icpMonth + b.streakDays * 2 - (a.icpMonth + a.streakDays * 2)
    );
    const strong = ranked[0]!;
    const weak = ranked[ranked.length - 1]!;
    if (strong.membershipId !== weak.membershipId) {
      msgs.push({
        id: 'mgr-legs',
        text: t('manager.unevenLegs', { strong: strong.name, weak: weak.name }),
        why: t('manager.unevenLegsWhy'),
        severity: 'medium',
      });
    }
  }

  if (teamHealth.grade === 'excellent' || teamHealth.grade === 'healthy') {
    msgs.push({
      id: 'mgr-healthy',
      text: t('manager.healthy'),
      why: teamHealth.why[0] ?? t('manager.healthyFallbackWhy'),
      severity: 'low',
    });
  }

  if ((input.dashboard?.activeToday ?? 0) >= 3) {
    msgs.push({
      id: 'mgr-congrats',
      text: t('manager.congratulations'),
      why: t('manager.congratulationsWhy', { count: input.dashboard?.activeToday ?? 0 }),
      severity: 'low',
    });
  }

  // Prefer priority-backed messages; keep list short (never annoying).
  const fromPriorities = priorities
    .filter((p) => p.severity === 'critical' || p.severity === 'high')
    .slice(0, 2)
    .map((p) => ({
      id: `mgr-prio-${p.id}`,
      text: p.title,
      why: p.why,
      severity: p.severity,
    }));

  const merged = [...msgs, ...fromPriorities];
  const seen = new Set<string>();
  return merged
    .filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    })
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 5);
}

export function buildDailyCeoBriefing(
  input: CoachOrgInput,
  priorities: CoachPriorityInsight[],
  teamHealth: BranchHealthAssessment
): DailyCeoBriefing {
  const t = translator(input);
  const name = input.sponsorFirstName || t('common.leader');
  const d = input.dashboard;
  const yesterdaySummary: string[] = [];

  if (d) {
    yesterdaySummary.push(t('briefing.teamAp', { count: d.teamAp }));
    yesterdaySummary.push(t('briefing.registrations', { count: d.newRegistrationsMonth }));
    if (d.openFollowups > 0) {
      yesterdaySummary.push(t('briefing.followups', { count: d.openFollowups }));
    }
    if (d.inactive14d > 0) {
      yesterdaySummary.push(t('briefing.inactive', { count: d.inactive14d }));
    }
    yesterdaySummary.push(
      t('briefing.activity', { active: d.activeToday, tasks: d.tasksDoneToday })
    );
  } else {
    yesterdaySummary.push(t('briefing.noData'));
  }

  const onboardingHelp = buildOnboardingLifecycle(input.partners, input.now, t).filter(
    (x) => x.needsHelp
  );
  if (onboardingHelp.length > 0) {
    yesterdaySummary.push(t('briefing.onboardingHelp', { count: onboardingHelp.length }));
  }

  const surface = priorities.filter((p) => p.severity !== 'low').slice(0, 5);
  const managerMessages = buildManagerMessages(input, priorities, teamHealth);

  return {
    greeting: t('briefing.greeting', { name }),
    yesterdaySummary: yesterdaySummary.slice(0, 6),
    priorities: surface,
    highestPriority: surface[0] ?? null,
    teamHealth,
    managerMessages,
  };
}

export function buildEveningReport(
  input: CoachOrgInput,
  priorities: CoachPriorityInsight[],
  teamHealth: BranchHealthAssessment
): EveningReport {
  const t = translator(input);
  const name = input.sponsorFirstName || t('common.leader');
  const d = input.dashboard;
  const wins: string[] = [];
  const missed: string[] = [];

  if (d) {
    if (d.tasksDoneToday > 0) wins.push(t('evening.tasksDone', { count: d.tasksDoneToday }));
    if (d.activeToday > 0) wins.push(t('evening.active', { count: d.activeToday }));
    if (d.newRegistrationsMonth > 0) {
      wins.push(t('evening.registrations', { count: d.newRegistrationsMonth }));
    }
    if (d.openFollowups > 0) {
      missed.push(t('evening.followupsOpen', { count: d.openFollowups }));
    }
    if (d.inactive14d > 0) {
      missed.push(t('evening.inactive', { count: d.inactive14d }));
    }
  }

  if (input.planDoneCount > 0) {
    wins.push(t('evening.missionsDone', { count: input.planDoneCount }));
  }
  if (input.planPendingCount > 0) {
    missed.push(t('evening.missionsOpen', { count: input.planPendingCount }));
  }
  if (input.pendingShareProofs > 0) {
    missed.push(t('evening.proofsPending', { count: input.pendingShareProofs }));
  }

  const tomorrow = priorities
    .filter((p) => p.severity === 'critical' || p.severity === 'high')
    .slice(0, 4)
    .map((p) => p.title);

  if (tomorrow.length === 0) {
    tomorrow.push(t('evening.tomorrowFallback'));
  }

  const managerMessages = buildManagerMessages(input, priorities, teamHealth);

  return {
    greeting: t('evening.greeting', { name }),
    todaysAp: d?.myApTotal ?? 0,
    todaysContactsTouched: input.contacts.filter((c) => {
      const idle = daysSince(c.lastEventAt, input.now);
      return idle === 0;
    }).length,
    todaysWins: wins.slice(0, 5),
    missedOpportunities: missed.slice(0, 5),
    tomorrowPriorities: tomorrow,
    teamHealth,
    managerMessages,
  };
}

/** High-value filter — Coach must never feel noisy. */
export function selectSurfaceInsights(
  priorities: CoachPriorityInsight[],
  max = 4
): CoachPriorityInsight[] {
  return priorities
    .filter((p) => p.severity === 'critical' || p.severity === 'high' || p.severity === 'medium')
    .slice(0, max);
}

export function buildCoachOrgIntelligence(input: CoachOrgInput): CoachOrgIntelligence {
  const t = translator(input);
  const teamHealth = assessOrgHealth(input);
  const branchHealth = assessBranchHealth(input.partners, input.now, t);
  const priorities = buildPriorities(input);
  const onboarding = buildOnboardingLifecycle(input.partners, input.now, t);
  const personInsights = input.partners
    .filter((p) => p.depth >= 1)
    .slice(0, 40)
    .map((p) => {
      const directsNeedingHelp = onboarding.filter(
        (o) =>
          o.needsHelp &&
          input.partners.some(
            (x) => x.membershipId === o.membershipId && x.sponsorMembershipId === p.membershipId
          )
      ).length;
      return buildPersonInsight(
        p,
        input.now,
        { directsNeedingHelp, onboardingUrl: input.onboardingUrl },
        t
      );
    });
  const followUps = buildFollowUpRecommendations(input.contacts, input.now, t);
  const managerMessages = buildManagerMessages(input, priorities, teamHealth);
  const briefing = buildDailyCeoBriefing(input, priorities, teamHealth);
  const evening = buildEveningReport(input, priorities, teamHealth);

  return {
    generatedAt: input.now.toISOString(),
    briefing,
    evening,
    priorities,
    teamHealth,
    branchHealth,
    personInsights,
    onboarding,
    followUps,
    managerMessages,
    surfaceInsights: selectSurfaceInsights(priorities),
    executive: buildExecutiveIntelligence(input, teamHealth, priorities, t),
  };
}

export function isMorningWindow(now: Date): boolean {
  const h = now.getHours();
  return h < 17;
}
