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
  OnboardingLifecycleItem,
  PersonCoachInsight,
} from './types';

const DAY_MS = 86_400_000;

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

function gradeLabel(grade: BranchHealthGrade): string {
  switch (grade) {
    case 'excellent':
      return 'Excellent';
    case 'healthy':
      return 'Healthy';
    case 'growing':
      return 'Growing';
    case 'needs_attention':
      return 'Needs Attention';
    case 'critical':
      return 'Critical';
  }
}

/** Org-wide branch health with explicit WHY (never color-only). */
export function assessOrgHealth(input: CoachOrgInput): BranchHealthAssessment {
  const d = input.dashboard;
  const why: string[] = [];
  let score = 70;

  if (!d) {
    return {
      grade: 'growing',
      score: 50,
      why: ['Noch zu wenig Organisationsdaten für eine belastbare Bewertung.'],
      membershipId: null,
      label: gradeLabel('growing'),
    };
  }

  const inactiveRatio = d.teamSize > 0 ? d.inactive14d / d.teamSize : 0;
  if (inactiveRatio >= 0.4) {
    score -= 30;
    why.push(`${d.inactive14d} Partner sind seit 14+ Tagen inaktiv — das schwächt die Struktur.`);
  } else if (inactiveRatio >= 0.2) {
    score -= 15;
    why.push(`${d.inactive14d} inaktive Partner brauchen gezielte Reaktivierung.`);
  } else {
    score += 8;
    why.push('Inaktivität ist im grünen Bereich — die Basis hält.');
  }

  if (d.openFollowups >= 8) {
    score -= 18;
    why.push(`${d.openFollowups} offene Follow-ups — Pipeline-Druck steigt.`);
  } else if (d.openFollowups >= 3) {
    score -= 8;
    why.push(`${d.openFollowups} Follow-ups warten auf dich.`);
  } else if (d.openFollowups === 0) {
    score += 6;
    why.push('Keine überfälligen Follow-ups — saubere Pipeline-Disziplin.');
  }

  if (d.newRegistrationsMonth >= 3) {
    score += 10;
    why.push(`+${d.newRegistrationsMonth} Registrierungen diesen Monat — Wachstum ist da.`);
  } else if (d.newRegistrationsMonth === 0 && d.teamSize > 3) {
    score -= 8;
    why.push('Diesen Monat noch keine neuen Consultant-Registrierungen.');
  }

  if (d.activeToday >= Math.max(2, Math.floor(d.directCount * 0.3))) {
    score += 8;
    why.push(`${d.activeToday} aktive Partner heute — Momentum im Team.`);
  }

  if (input.teamLeader && !input.teamLeader.qualified) {
    const missing = Math.max(
      0,
      input.teamLeader.requiredFirstlines - input.teamLeader.activeFirstlines
    );
    if (missing > 0 && missing <= 2) {
      score += 4;
      why.push(
        `Nur noch ${missing} aktive Firstline(s) bis TeamLeader — Qualifikation in Reichweite.`
      );
    }
  }

  if (input.pendingShareProofs > 0) {
    why.push(`${input.pendingShareProofs} AP-Nachweise warten — Integrität vor Punkten.`);
  }

  score = clampScore(score);
  const grade = gradeFromScore(score);
  if (why.length === 0) why.push('Stabile Lage — weiter priorisieren und führen.');

  return {
    grade,
    score,
    why: why.slice(0, 4),
    membershipId: null,
    label: gradeLabel(grade),
  };
}

/** Per-direct-line health for firstline branches. */
export function assessBranchHealth(
  partners: CoachPartnerSnapshot[],
  now: Date
): BranchHealthAssessment[] {
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
      why.push(`${inactive} in der Linie sind 14+ Tage still.`);
    }

    if (lead.streakDays >= 5) {
      score += 12;
      why.push(`${lead.name} hält ${lead.streakDays} Tage Streak — Vorbildwirkung.`);
    } else if (lead.streakDays === 0) {
      score -= 10;
      why.push(`${lead.name} hat keinen aktiven Streak.`);
    }

    if (lead.icpMonth > 0) {
      score += 8;
      why.push(`ICP-Monat ${lead.icpMonth} — Linie produziert.`);
    }

    const newest = daysSince(lead.joinedAt, now);
    if (newest !== null && newest <= 14 && lead.directCount === 0) {
      score -= 5;
      why.push('Neue Firstline ohne eigenes Team — Onboarding und Begleitung priorisieren.');
    }

    if (why.length === 0) why.push('Solide Firstline — weiter beobachten und stärken.');
    score = clampScore(score);
    const grade = gradeFromScore(score);
    return {
      grade,
      score,
      why: why.slice(0, 3),
      membershipId: lead.membershipId,
      label: `${lead.name} · ${gradeLabel(grade)}`,
    };
  });
}

export function buildPersonInsight(partner: CoachPartnerSnapshot, now: Date): PersonCoachInsight {
  const idle = daysSince(partner.lastAppOpenedAt, now);
  const tenure = daysSince(partner.joinedAt, now) ?? 0;
  const bullets: string[] = [];
  let headline = 'Stabil im Blick behalten.';
  let severity: InsightSeverity = 'low';
  let recommendation: PersonCoachInsight['recommendation'] = null;

  if (idle === null || idle >= 14) {
    headline = idle === null ? 'Noch nie in der App aktiv.' : `Inaktiv seit ${idle} Tagen.`;
    bullets.push('Reaktivierung statt Druck — kurzer, ehrlicher Check-in.');
    recommendation = 'reactivation';
    severity = 'high';
  } else if (idle >= 6) {
    headline = `Inaktiv seit ${idle} Tagen.`;
    bullets.push('Momentum droht zu kippen — Voice Message oder kurzer Call.');
    recommendation = 'voice_message';
    severity = 'medium';
  } else if (partner.streakDays >= 7) {
    headline = 'Sehr aktiv — starke Konsistenz.';
    bullets.push(`${partner.streakDays}-Tage-Streak verdient Anerkennung.`);
    recommendation = 'recognition';
    severity = 'low';
  } else if (tenure <= 14) {
    headline = 'Neuer Consultant — Onboarding im Fokus.';
    bullets.push('Prüfen: Onboarding gesendet? Austauschgruppe / Nina-Info erreicht?');
    recommendation = 'onboarding';
    severity = 'medium';
  } else if (partner.directCount >= 3 && partner.streakDays >= 3) {
    headline = 'Potenzial als zukünftige Führung.';
    bullets.push('Firstlines wachsen — Leadership-Gespräch anbieten.');
    recommendation = 'promotion';
    severity = 'medium';
  } else if (partner.icpMonth > 0 && partner.streakDays >= 3) {
    headline = 'Starkes Momentum.';
    bullets.push('ICP und Aktivität laufen — kurz gratulieren und nächstes Ziel setzen.');
    recommendation = 'congratulation';
    severity = 'low';
  }

  if (partner.apTotal > 0) bullets.push(`AP gesamt: ${partner.apTotal}.`);
  if (partner.rankLabel) bullets.push(`Rang: ${partner.rankLabel}.`);

  return {
    membershipId: partner.membershipId,
    name: partner.name,
    headline,
    bullets: bullets.slice(0, 4),
    recommendation,
    severity,
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
  now: Date
): FollowUpRecommendation[] {
  const out: FollowUpRecommendation[] = [];
  for (const c of contacts) {
    const heat = contactHeat(c, now);
    const idle = daysSince(c.lastEventAt, now);
    if (heat === 'hot') {
      out.push({
        contactId: c.id,
        name: c.name,
        heat,
        why: 'Heißer Prospect — zeitnah Follow-up, bevor das Fenster schließt.',
        nextAction: 'call',
      });
    } else if (heat === 'forgotten') {
      out.push({
        contactId: c.id,
        name: c.name,
        heat,
        why: `Seit ${idle ?? '?'} Tagen kein Event — vergessen wirkt teurer als ein kurzer Touch.`,
        nextAction: 'follow_up',
      });
    } else if (heat === 'lost') {
      out.push({
        contactId: c.id,
        name: c.name,
        heat,
        why: 'Lange Stille — Reaktivierung oder ehrliches Loslassen.',
        nextAction: 'reactivation',
      });
    } else if (heat === 'interested' && idle !== null && idle >= 3) {
      out.push({
        contactId: c.id,
        name: c.name,
        heat,
        why: c.nextStep || 'Interessiert, aber ohne frischen Touch — nächsten Schritt setzen.',
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
  now: Date
): OnboardingLifecycleItem[] {
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
      let note =
        'Registriert — Onboarding (WayToMoon → Onboarding) als letzten Aktivierungsschritt senden.';

      if (idle !== null && idle <= 2 && tenure >= 1) {
        stage = 'opened';
        needsHelp = false;
        note = 'App geöffnet — prüfen, ob Onboarding abgeschlossen und Gruppenzugänge klar sind.';
      }
      if (p.streakDays >= 3 && p.directCount === 0) {
        stage = 'completed';
        needsHelp = false;
        note = 'Aktivität sichtbar — Austauschgruppe und Nina-Informationsgruppe absichern.';
      }
      if (p.directCount > 0 || (p.streakDays >= 5 && tenure >= 7)) {
        stage = 'fully_onboarded';
        needsHelp = false;
        note = 'Wirkt onboarded — in Leadership-Begleitung überführen.';
      }
      if (idle === null || (idle !== null && idle >= 7 && tenure <= 21)) {
        needsHelp = true;
        note = 'Steckt fest — persönlicher Check-in und Onboarding-Link erneut teilen.';
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
  const items: CoachPriorityInsight[] = [];
  const now = input.now;

  for (const w of input.warnings.slice(0, 8)) {
    items.push({
      id: `warn-${w.membershipId}-${w.kind}`,
      severity: w.kind.includes('inactive') || w.kind.includes('critical') ? 'high' : 'medium',
      title: w.title,
      why: w.action,
      recommendation: w.kind.includes('inactive') ? 'reactivation' : 'follow_up',
      targetName: w.name,
      targetMembershipId: w.membershipId,
      targetContactId: null,
    });
  }

  for (const fu of buildFollowUpRecommendations(input.contacts, now).slice(0, 5)) {
    items.push({
      id: `fu-${fu.contactId}`,
      severity: fu.heat === 'hot' ? 'critical' : fu.heat === 'forgotten' ? 'high' : 'medium',
      title:
        fu.heat === 'hot'
          ? `Call ${fu.name}`
          : fu.heat === 'forgotten'
            ? `Follow-up ${fu.name}`
            : `${fu.name} braucht einen Touch`,
      why: fu.why,
      recommendation: fu.nextAction,
      targetName: fu.name,
      targetMembershipId: null,
      targetContactId: fu.contactId,
    });
  }

  for (const ob of buildOnboardingLifecycle(input.partners, now).filter((x) => x.needsHelp)) {
    items.push({
      id: `onb-${ob.membershipId}`,
      severity: 'high',
      title: `${ob.name} braucht Onboarding-Hilfe`,
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
        title: `Nur noch ${missing} aktive Firstline(s) bis TeamLeader`,
        why: 'Langfristige Leadership-Qualifikation liegt in Reichweite — Firstlines aktiv halten.',
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
      title: `${input.pendingShareProofs} AP-Nachweis(e) offen`,
      why: 'Kein AP ohne Verifikation — Pending → Verified, nie Fake-Punkte.',
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
      title: 'Tagesplan noch nicht gestartet',
      why: `${input.planPendingCount} Missionen warten — Fokus schlägt Chaos.`,
      recommendation: 'call',
      targetName: null,
      targetMembershipId: null,
      targetContactId: null,
    });
  }

  return items.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).slice(0, 16);
}

export function buildDailyCeoBriefing(
  input: CoachOrgInput,
  priorities: CoachPriorityInsight[],
  teamHealth: BranchHealthAssessment
): DailyCeoBriefing {
  const name = input.sponsorFirstName || 'Leader';
  const d = input.dashboard;
  const yesterdaySummary: string[] = [];

  if (d) {
    yesterdaySummary.push(`Team AP gesamt im Blick: ${d.teamAp}`);
    yesterdaySummary.push(`+${d.newRegistrationsMonth} Registrierungen (Monat)`);
    if (d.openFollowups > 0) {
      yesterdaySummary.push(`${d.openFollowups} Follow-ups brauchen Aufmerksamkeit`);
    }
    if (d.inactive14d > 0) {
      yesterdaySummary.push(`${d.inactive14d} Partner seit 14+ Tagen inaktiv`);
    }
    yesterdaySummary.push(`${d.activeToday} heute aktiv · ${d.tasksDoneToday} Team-Tasks heute`);
  } else {
    yesterdaySummary.push(
      'Organisationslage wird aufgebaut — sobald Daten da sind, brief ich dich.'
    );
  }

  const onboardingHelp = buildOnboardingLifecycle(input.partners, input.now).filter(
    (x) => x.needsHelp
  );
  if (onboardingHelp.length > 0) {
    yesterdaySummary.push(`${onboardingHelp.length} brauchen noch Onboarding-Hilfe`);
  }

  const surface = priorities.filter((p) => p.severity !== 'low').slice(0, 5);

  return {
    greeting: `Guten Morgen, ${name}.`,
    yesterdaySummary: yesterdaySummary.slice(0, 6),
    priorities: surface,
    highestPriority: surface[0] ?? null,
    teamHealth,
  };
}

export function buildEveningReport(
  input: CoachOrgInput,
  priorities: CoachPriorityInsight[],
  teamHealth: BranchHealthAssessment
): EveningReport {
  const name = input.sponsorFirstName || 'Leader';
  const d = input.dashboard;
  const wins: string[] = [];
  const missed: string[] = [];

  if (d) {
    if (d.tasksDoneToday > 0) wins.push(`${d.tasksDoneToday} Team-Tasks heute erledigt`);
    if (d.activeToday > 0) wins.push(`${d.activeToday} Partner heute aktiv`);
    if (d.newRegistrationsMonth > 0) {
      wins.push(`${d.newRegistrationsMonth} Registrierungen im Monat`);
    }
    if (d.openFollowups > 0) {
      missed.push(`${d.openFollowups} Follow-ups bleiben offen`);
    }
    if (d.inactive14d > 0) {
      missed.push(`${d.inactive14d} inaktive Partner ohne Reaktivierung`);
    }
  }

  if (input.planDoneCount > 0) {
    wins.push(`${input.planDoneCount} eigene Missionen heute erledigt`);
  }
  if (input.planPendingCount > 0) {
    missed.push(`${input.planPendingCount} Missionen noch offen`);
  }
  if (input.pendingShareProofs > 0) {
    missed.push(`${input.pendingShareProofs} AP-Nachweise noch pending`);
  }

  const tomorrow = priorities
    .filter((p) => p.severity === 'critical' || p.severity === 'high')
    .slice(0, 4)
    .map((p) => p.title);

  if (tomorrow.length === 0) {
    tomorrow.push('Erste Follow-ups und Onboarding-Checks vor Mittag erledigen');
  }

  return {
    greeting: `Guten Abend, ${name}.`,
    todaysAp: d?.myApTotal ?? 0,
    todaysContactsTouched: input.contacts.filter((c) => {
      const idle = daysSince(c.lastEventAt, input.now);
      return idle === 0;
    }).length,
    todaysWins: wins.slice(0, 5),
    missedOpportunities: missed.slice(0, 5),
    tomorrowPriorities: tomorrow,
    teamHealth,
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
  const teamHealth = assessOrgHealth(input);
  const branchHealth = assessBranchHealth(input.partners, input.now);
  const priorities = buildPriorities(input);
  const personInsights = input.partners
    .filter((p) => p.depth >= 1)
    .slice(0, 40)
    .map((p) => buildPersonInsight(p, input.now));
  const onboarding = buildOnboardingLifecycle(input.partners, input.now);
  const followUps = buildFollowUpRecommendations(input.contacts, input.now);
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
    surfaceInsights: selectSurfaceInsights(priorities),
  };
}

export function isMorningWindow(now: Date): boolean {
  const h = now.getHours();
  return h < 17;
}
