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

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function labelScore(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Strong';
  if (score >= 55) return 'Building';
  if (score >= 35) return 'Fragile';
  return 'Critical';
}

export function buildMomentumScore(input: CoachOrgInput): ScoredDimension {
  const d = input.dashboard;
  const why: string[] = [];
  const drivers: string[] = [];
  let score = 55;

  if (!d) {
    return {
      score: 50,
      label: labelScore(50),
      why: ['Momentum braucht laufende Aktivitätsdaten — Basis wird noch aufgebaut.'],
      drivers: [],
    };
  }

  if (d.activeToday >= Math.max(2, Math.floor(d.directCount * 0.25))) {
    score += 14;
    why.push(`${d.activeToday} Partner heute aktiv — Tagesenergie ist sichtbar.`);
    drivers.push('Daily activity');
  } else if (d.activeToday === 0 && d.teamSize > 2) {
    score -= 12;
    why.push('Heute noch keine Team-Aktivität — Momentum braucht den ersten Impuls.');
  }

  if (d.tasksDoneToday > 0) {
    score += 8;
    why.push(`${d.tasksDoneToday} Team-Tasks erledigt — Ausführung statt Absicht.`);
    drivers.push('Task completion');
  }

  if (d.newRegistrationsMonth > 0) {
    score += 10;
    why.push(`+${d.newRegistrationsMonth} Registrierungen im Monat — Wachstum trägt Momentum.`);
    drivers.push('Registrations');
  }

  const streakers = input.partners.filter((p) => p.depth >= 1 && p.streakDays >= 3).length;
  if (streakers > 0) {
    score += Math.min(12, streakers * 3);
    why.push(`${streakers} Partner mit Streak ≥3 — Konsistenz ist ein Momentum-Multiplikator.`);
    drivers.push('Streaks');
  }

  if (d.inactive14d > 0 && d.teamSize > 0 && d.inactive14d / d.teamSize >= 0.35) {
    score -= 14;
    why.push('Hoher Inaktivitätsanteil dämpft das Team-Momentum.');
  }

  score = clamp(score);
  return { score, label: labelScore(score), why: why.slice(0, 5), drivers };
}

export function buildLeadershipScore(input: CoachOrgInput): ScoredDimension {
  const d = input.dashboard;
  const why: string[] = [];
  const drivers: string[] = [];
  let score = 58;

  if (input.planDoneCount > 0) {
    score += 10;
    why.push(`${input.planDoneCount} eigene Missionen erledigt — Vorbild durch Tun.`);
    drivers.push('Personal execution');
  }
  if (input.planPendingCount > 3) {
    score -= 8;
    why.push(`${input.planPendingCount} offene Missionen — Fokus schärfen, dann führen.`);
  }

  if (d && d.openFollowups === 0) {
    score += 10;
    why.push('Pipeline sauber — Follow-up-Disziplin ist Leadership.');
    drivers.push('Pipeline discipline');
  } else if (d && d.openFollowups >= 5) {
    score -= 10;
    why.push(`${d.openFollowups} offene Follow-ups belasten die Führungsbandbreite.`);
  }

  if (input.teamLeader?.qualified) {
    score += 12;
    why.push('TeamLeader-Qualifikation erreicht — Standard ist gesetzt.');
    drivers.push('Qualification');
  } else if (input.teamLeader) {
    const missing = Math.max(
      0,
      input.teamLeader.requiredFirstlines - input.teamLeader.activeFirstlines
    );
    if (missing <= 2) {
      score += 6;
      why.push(`Qualifikation nah — noch ${missing} aktive Firstline(s).`);
      drivers.push('Qualification path');
    }
  }

  const favorites = input.partners.filter((p) => p.isFavorite).length;
  if (favorites > 0) {
    score += 4;
    why.push('Du markierst Fokuspartner — gezielte Führung statt Gießkanne.');
    drivers.push('Focus partners');
  }

  if (input.pendingShareProofs > 0) {
    score -= 4;
    why.push('Offene AP-Nachweise — Integrität der Zahlen schützt Vertrauen.');
  }

  score = clamp(score);
  return { score, label: labelScore(score), why: why.slice(0, 5), drivers };
}

export function buildBottlenecks(input: CoachOrgInput): BottleneckInsight[] {
  const d = input.dashboard;
  const items: BottleneckInsight[] = [];

  if (d && d.openFollowups >= 3) {
    items.push({
      id: 'bn-followups',
      area: 'Pipeline',
      title: 'Follow-up Stau',
      why: `${d.openFollowups} offene Follow-ups blockieren neue Gespräche.`,
      unlock: 'Heute die 3 heißesten Kontakte schließen — dann erst neue Termine.',
    });
  }

  if (d && d.inactive14d >= 3) {
    items.push({
      id: 'bn-inactive',
      area: 'Aktivierung',
      title: 'Inaktivitäts-Cluster',
      why: `${d.inactive14d} Partner ohne App-Signal seit 14+ Tagen.`,
      unlock: 'Zwei kurze Voice-Messages an Favoriten — niedrige Reibung, hohe Signalwirkung.',
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
      area: 'Onboarding',
      title: 'Onboarding-Flaschenhals',
      why: `${stuckOnboarding.length} Firstline(s) stecken früh ohne AP-Schwung fest.`,
      unlock: `Mit ${stuckOnboarding[0].name.split(' ')[0]} den nächsten Onboarding-Schritt klar machen.`,
    });
  }

  if (input.planPendingCount >= 4) {
    items.push({
      id: 'bn-focus',
      area: 'Fokus',
      title: 'Zu viele parallele Missionen',
      why: `${input.planPendingCount} offene Tagesmissionen verwässern Wirkung.`,
      unlock: 'Eine Mission zu Ende bringen, bevor die nächste startet.',
    });
  }

  return items.slice(0, 5);
}

export function buildRoiRecommendations(
  input: CoachOrgInput,
  priorities: CoachPriorityInsight[]
): RoiRecommendation[] {
  const out: RoiRecommendation[] = [];
  for (const p of priorities.slice(0, 4)) {
    out.push({
      id: `roi-${p.id}`,
      action: p.title,
      why: p.why,
      expectedLift:
        p.severity === 'critical' || p.severity === 'high'
          ? 'Hoher Hebel auf Teamgesundheit und Pipeline'
          : 'Solider Hebel bei geringem Zusatzaufwand',
    });
  }
  if (out.length === 0 && input.dashboard) {
    out.push({
      id: 'roi-default',
      action: 'Zwei Follow-ups vor Mittag',
      why: 'Frühe Pipeline-Arbeit schützt den Nachmittag für Leadership.',
      expectedLift: 'Weniger Überhänge, klareres Abendbild',
    });
  }
  return out.slice(0, 5);
}

export function buildLeadershipDna(input: CoachOrgInput): LeadershipDnaTrait[] {
  const traits: LeadershipDnaTrait[] = [];
  const d = input.dashboard;

  if (input.planDoneCount > 0) {
    traits.push({
      id: 'dna-exec',
      trait: 'Execution',
      evidence: `${input.planDoneCount} Missionen heute erledigt`,
      why: 'Teams folgen dem, was der Leader selbst abschließt.',
    });
  }
  if (d && d.openFollowups <= 2) {
    traits.push({
      id: 'dna-care',
      trait: 'Care & Consistency',
      evidence: 'Follow-ups im Griff',
      why: 'Zuverlässige Nacharbeit baut Vertrauen in der Firstline.',
    });
  }
  if (d && d.newRegistrationsMonth > 0) {
    traits.push({
      id: 'dna-growth',
      trait: 'Growth Orientation',
      evidence: `+${d.newRegistrationsMonth} Registrierungen`,
      why: 'Du erzeugst Einstiege — nicht nur Verwaltung.',
    });
  }
  const streakers = input.partners.filter((p) => p.streakDays >= 5).length;
  if (streakers > 0) {
    traits.push({
      id: 'dna-culture',
      trait: 'Culture of Consistency',
      evidence: `${streakers} Partner mit starken Streaks`,
      why: 'Wiederholung ist die DNA nachhaltiger Organisationen.',
    });
  }
  if (traits.length === 0) {
    traits.push({
      id: 'dna-base',
      trait: 'Builder Mindset',
      evidence: 'Organisation wird aktiv geführt',
      why: 'Selbst ohne Peak-Zahlen zählt die Absicht, Struktur zu formen.',
    });
  }
  return traits.slice(0, 5);
}

export function buildExecutiveTimeline(
  input: CoachOrgInput,
  priorities: CoachPriorityInsight[]
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const nowIso = input.now.toISOString();
  const d = input.dashboard;

  if (d && d.tasksDoneToday > 0) {
    events.push({
      id: 'tl-tasks',
      at: nowIso,
      title: `${d.tasksDoneToday} Team-Tasks heute`,
      why: 'Ausführung erzeugt messbare Fortschrittsmomente.',
      kind: 'win',
    });
  }
  if (d && d.newRegistrationsMonth > 0) {
    events.push({
      id: 'tl-reg',
      at: nowIso,
      title: `${d.newRegistrationsMonth} Registrierungen (Monat)`,
      why: 'Neue Einstiege erweitern die Führungsfläche.',
      kind: 'win',
    });
  }
  if (d && d.inactive14d > 0) {
    events.push({
      id: 'tl-inactive',
      at: nowIso,
      title: `${d.inactive14d} inaktive Partner`,
      why: 'Früh erkannt — Reaktivierung bleibt günstig.',
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
  leadership: ScoredDimension
): ForecastItem[] {
  const d = input.dashboard;
  const items: ForecastItem[] = [];

  items.push({
    id: 'fc-7d',
    horizon: '7d',
    title:
      momentum.score >= 65
        ? '7 Tage: Momentum kann sich verfestigen'
        : '7 Tage: Ein Aktivierungsstoß verändert die Kurve',
    why: momentum.why[0] ?? 'Kurzfristiges Verhalten der Firstline bestimmt die Wochenlage.',
    confidence: momentum.score >= 60 ? 'medium' : 'low',
  });

  items.push({
    id: 'fc-30d',
    horizon: '30d',
    title:
      (d?.newRegistrationsMonth ?? 0) > 0
        ? '30 Tage: Wachstumspfad bleibt offen'
        : '30 Tage: Fokus auf Einstiege und Onboarding',
    why:
      (d?.newRegistrationsMonth ?? 0) > 0
        ? 'Registrierungen signalisieren, dass der Funnel trägt.'
        : 'Ohne neue Einstiege stagniert die Führungsfläche.',
    confidence: 'medium',
  });

  items.push({
    id: 'fc-90d',
    horizon: '90d',
    title:
      leadership.score >= 70
        ? '90 Tage: Leadership-Standard kann skalieren'
        : '90 Tage: DNA festigen, dann skalieren',
    why: leadership.why[0] ?? 'Langfristig gewinnt wiederholbare Führungsqualität.',
    confidence: leadership.score >= 70 ? 'high' : 'medium',
  });

  return items;
}

export function buildWhatHappened(input: CoachOrgInput): ExecutiveInsight[] {
  const d = input.dashboard;
  const out: ExecutiveInsight[] = [];
  if (d) {
    out.push({
      id: 'wh-activity',
      headline: `${d.activeToday} aktiv heute · ${d.tasksDoneToday} Tasks`,
      why: 'Tagesaktivität und Tasks sind die härtesten Ist-Signale.',
      severity: d.activeToday > 0 ? 'low' : 'medium',
    });
    out.push({
      id: 'wh-pipeline',
      headline: `${d.openFollowups} offene Follow-ups · ${d.inactive14d} inaktiv (14d)`,
      why: 'Pipeline und Inaktivität erklären den aktuellen Druck.',
      severity: d.openFollowups >= 5 || d.inactive14d >= 5 ? 'high' : 'medium',
    });
    if (d.newRegistrationsMonth > 0) {
      out.push({
        id: 'wh-growth',
        headline: `+${d.newRegistrationsMonth} Registrierungen im Monat`,
        why: 'Neue Consultant-Einstiege sind das Wachstumssignal der Organisation.',
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
  priorities: CoachPriorityInsight[]
): ExecutiveIntelligence {
  const momentum = buildMomentumScore(input);
  const leadership = buildLeadershipScore(input);
  const forecast = buildFutureForecast(input, momentum, leadership);
  const whatHappened = buildWhatHappened(input);
  const whatHappensNext = buildWhatNext(priorities, forecast);
  const whatToDoToday = buildWhatToday(priorities);

  const whyItMatters: ExecutiveInsight[] = [
    {
      id: 'why-health',
      headline: `Branch Health ${branchHealth.score}/100 · ${branchHealth.label}`,
      why: branchHealth.why[0] ?? 'Gesundheit steuert, wie viel Führungskapazität frei wird.',
      severity: branchHealth.score < 55 ? 'high' : 'medium',
    },
    {
      id: 'why-momentum',
      headline: `Momentum ${momentum.score}/100 · ${momentum.label}`,
      why: momentum.why[0] ?? 'Momentum zeigt, ob Energie steigt oder abflacht.',
      severity: momentum.score < 55 ? 'high' : 'low',
    },
    {
      id: 'why-leadership',
      headline: `Leadership ${leadership.score}/100 · ${leadership.label}`,
      why: leadership.why[0] ?? 'Leadership-Qualität multipliziert jedes Team-Signal.',
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
    bottlenecks: buildBottlenecks(input),
    roiRecommendations: buildRoiRecommendations(input, priorities),
    leadershipDna: buildLeadershipDna(input),
    timeline: buildExecutiveTimeline(input, priorities),
    forecast,
  };
}
