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

export function buildPersonInsight(
  partner: CoachPartnerSnapshot,
  now: Date,
  org?: { siblings?: CoachPartnerSnapshot[]; directsNeedingHelp?: number }
): PersonCoachInsight {
  const idle = daysSince(partner.lastAppOpenedAt, now);
  const tenure = daysSince(partner.joinedAt, now) ?? 0;
  const bullets: string[] = [];
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  let headline = 'Stabil im Blick behalten.';
  let severity: InsightSeverity = 'low';
  let recommendation: PersonCoachInsight['recommendation'] = null;
  let currentSituation = `${partner.name} läuft stabil — weiter beobachten.`;
  let nextBestAction = 'Kurzer Check-in und nächstes Ziel setzen.';
  let nextBestActionWhy = 'Regelmäßige Führung hält Momentum, bevor Probleme entstehen.';
  let possibleObjection: string | null = null;
  let probabilityOfRegistration = 35;
  let probabilityOfInactivity = 25;
  let riskScore = 20;

  if (idle === null || idle >= 14) {
    headline = idle === null ? 'Noch nie in der App aktiv.' : `Inaktiv seit ${idle} Tagen.`;
    currentSituation = `${partner.name} ist ${idle === null ? 'noch nicht' : `seit ${idle} Tagen nicht`} aktiv.`;
    bullets.push('Reaktivierung statt Druck — kurzer, ehrlicher Check-in.');
    recommendation = 'reactivation';
    severity = 'high';
    nextBestAction = 'Voice Message oder kurzer Call zur Reaktivierung.';
    nextBestActionWhy = `Ich empfehle das, weil ${partner.name} ${idle === null ? 'noch nie aktiv war' : `seit ${idle} Tagen inaktiv ist`} und ohne Touch die Wahrscheinlichkeit weiter sinkt.`;
    possibleObjection = '„Ich hatte keine Zeit / war im Urlaub.“';
    weaknesses.push('Lange Stille');
    probabilityOfInactivity = idle === null ? 80 : Math.min(95, 50 + idle);
    probabilityOfRegistration = 15;
    riskScore = Math.min(95, 55 + (idle ?? 20));
  } else if (idle >= 6) {
    headline = `Inaktiv seit ${idle} Tagen.`;
    currentSituation = `${partner.name} verliert Momentum — ${idle} Tage ohne App-Öffnung.`;
    bullets.push('Momentum droht zu kippen — Voice Message oder kurzer Call.');
    recommendation = 'voice_message';
    severity = 'medium';
    nextBestAction = `Heute ${partner.name} anrufen oder Voice Message senden.`;
    nextBestActionWhy = `Ich empfehle den Call, weil ${partner.name} seit ${idle} Tagen inaktiv ist${
      org?.directsNeedingHelp
        ? ` und aktuell ${org.directsNeedingHelp} direkte Partner auf Onboarding warten`
        : ''
    }.`;
    possibleObjection = '„Mir fehlt gerade die Klarheit für den nächsten Schritt.“';
    weaknesses.push('Streak-Risiko');
    probabilityOfInactivity = 55 + idle;
    riskScore = 40 + idle * 2;
  } else if (partner.streakDays >= 1 && partner.streakDays <= 2 && tenure > 14) {
    headline = 'Streak wackelt — Ermutigung hilft.';
    currentSituation = `${partner.name} hat nur noch ${partner.streakDays} Streak-Tag(e).`;
    recommendation = 'recognition';
    severity = 'medium';
    nextBestAction = 'Kurze Anerkennung + konkreter Mini-Schritt für heute.';
    nextBestActionWhy = `Der Streak ist auf ${partner.streakDays} Tage gesunken — frühe Ermutigung verhindert Abbruch.`;
    weaknesses.push('Streak-Verlust droht');
    probabilityOfInactivity = 45;
    riskScore = 35;
  } else if (partner.streakDays >= 7) {
    headline = 'Sehr aktiv — starke Konsistenz.';
    currentSituation = `${partner.name} hält ${partner.streakDays} Tage Streak.`;
    bullets.push(`${partner.streakDays}-Tage-Streak verdient Anerkennung.`);
    recommendation = 'recognition';
    severity = 'low';
    strengths.push('Hohe Konsistenz', 'Vorbildwirkung');
    nextBestAction = 'Anerkennung aussprechen und nächstes Leadership-Ziel setzen.';
    nextBestActionWhy = 'Starke Konsistenz verdient Sichtbarkeit — das verstärkt Kultur.';
    probabilityOfInactivity = 10;
    probabilityOfRegistration = 55;
    riskScore = 10;
  } else if (tenure <= 14) {
    headline = 'Neuer Consultant — Onboarding im Fokus.';
    currentSituation = `${partner.name} ist seit ${tenure} Tagen registriert — finales Onboarding absichern.`;
    bullets.push('Prüfen: Onboarding gesendet? Austauschgruppe / Nina-Info erreicht?');
    recommendation = 'onboarding';
    severity = 'medium';
    nextBestAction = 'Onboarding-Link senden und Gruppenzugänge erklären.';
    nextBestActionWhy = `Neue Berater brauchen den letzten Aktivierungsschritt nach der Registrierung — sonst entstehen Onboarding-Lücken.`;
    possibleObjection = '„Ich schaue es später an.“';
    weaknesses.push('Onboarding möglicherweise offen');
    probabilityOfRegistration = 70;
    probabilityOfInactivity = 40;
    riskScore = 30;
  } else if (partner.directCount >= 3 && partner.streakDays >= 3) {
    headline = 'Potenzial als zukünftige Führung.';
    currentSituation = `${partner.name} führt ${partner.directCount} Direkte und bleibt aktiv.`;
    bullets.push('Firstlines wachsen — Leadership-Gespräch anbieten.');
    recommendation = 'promotion';
    severity = 'medium';
    strengths.push('Teamwachstum', 'Aktive Führung');
    nextBestAction = 'Leadership-Coaching / Zoom anbieten.';
    nextBestActionWhy = 'Wachsende Firstline + Aktivität signalisieren Leader-Potenzial.';
    probabilityOfRegistration = 60;
    probabilityOfInactivity = 15;
    riskScore = 15;
  } else if (partner.icpMonth > 0 && partner.streakDays >= 3) {
    headline = 'Starkes Momentum.';
    currentSituation = `${partner.name} liefert ICP (${partner.icpMonth}) bei aktivem Streak.`;
    bullets.push('ICP und Aktivität laufen — kurz gratulieren und nächstes Ziel setzen.');
    recommendation = 'congratulation';
    severity = 'low';
    strengths.push('ICP-Produktion');
    nextBestAction = 'Gratulation + nächstes Ziel vereinbaren.';
    nextBestActionWhy = 'Sichtbare Erfolge verstärken, wenn sie zeitnah anerkannt werden.';
    probabilityOfInactivity = 18;
    riskScore = 12;
  }

  if (partner.apTotal > 0) {
    bullets.push(`AP gesamt: ${partner.apTotal}.`);
    if (partner.apTotal >= 250) strengths.push('Solide AP-Basis');
  }
  if (partner.rankLabel) bullets.push(`Rang: ${partner.rankLabel}.`);
  if (partner.directCount >= 5) strengths.push('Breite Firstline');
  if (partner.teamCount === 0 && tenure > 21) weaknesses.push('Noch kein eigenes Team');

  const first = partner.name.split(' ')[0] || partner.name;
  const suggestedWhatsApp =
    recommendation === 'onboarding'
      ? `Hey ${first}, hier ist dein Onboarding — der letzte Schritt nach der Registrierung: http://waytomoon.netlify.app\nWenn etwas unklar ist, melde dich einfach.`
      : recommendation === 'reactivation' || recommendation === 'voice_message'
        ? `Hey ${first}, mir ist aufgefallen, dass es eine Weile ruhig war. Kein Druck — wie geht’s dir und kann ich dich irgendwo entlasten?`
        : recommendation === 'recognition' || recommendation === 'congratulation'
          ? `Hey ${first}, kurze Nachricht: Deine Aktivität fällt positiv auf. Weiter so — ich sehe das.`
          : `Hey ${first}, kurze Nachfrage zum nächsten Schritt. Passt dir ein kurzer Call heute oder morgen?`;

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

  // Streak loss / encouragement
  for (const p of input.partners) {
    if (p.depth < 1) continue;
    if (p.streakDays >= 1 && p.streakDays <= 2) {
      items.push({
        id: `streak-${p.membershipId}`,
        severity: 'medium',
        title: `${p.name} braucht Ermutigung`,
        why: `Der Streak liegt nur noch bei ${p.streakDays} Tag(en) — frühe Anerkennung verhindert Abbruch.`,
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
        title: `${strong.name}-Linie wächst stärker`,
        why: `Vergleich der Firstlines: ${strong.name} zeigt mehr ICP/Streak-Momentum als ${weak.name}.`,
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
          title: `${weak.name}-Linie braucht Aufmerksamkeit`,
          why: `Die Linie um ${weak.name} ist die schwächste Firstline — Coaching statt Druck.`,
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
  const msgs: ManagerMessage[] = [];
  const forgotten = buildFollowUpRecommendations(input.contacts, input.now).filter(
    (f) => f.heat === 'forgotten' || f.heat === 'hot'
  );
  if (forgotten.length >= 1) {
    const hot = forgotten.find((f) => f.heat === 'hot');
    if (hot) {
      msgs.push({
        id: `mgr-call-${hot.contactId}`,
        text: `Du solltest ${hot.name} heute anrufen.`,
        why: hot.why,
        severity: 'critical',
      });
    }
    const forg = forgotten.filter((f) => f.heat === 'forgotten');
    if (forg.length >= 3) {
      msgs.push({
        id: 'mgr-fu-many',
        text: `Heute sind mir ${forg.length} Personen aufgefallen, die noch keinen Follow-up erhalten haben.`,
        why: 'Vergessene Kontakte kühlen ab — drei gezielte Touches retten oft mehr als zehn neue Leads.',
        severity: 'high',
      });
    } else if (forg[0]) {
      msgs.push({
        id: `mgr-fu-${forg[0].contactId}`,
        text: `Du hast einen Kontakt (${forg[0].name}) zu lange ignoriert.`,
        why: forg[0].why,
        severity: 'high',
      });
    }
  }

  const onboardingGaps = buildOnboardingLifecycle(input.partners, input.now).filter(
    (x) => x.needsHelp
  );
  if (onboardingGaps.length >= 1) {
    msgs.push({
      id: 'mgr-onb-gaps',
      text:
        onboardingGaps.length === 1
          ? `${onboardingGaps[0]!.name} wartet noch auf Onboarding-Hilfe.`
          : `Du hast aktuell ${onboardingGaps.length} Onboarding-Lücken.`,
      why: 'Onboarding ist der letzte Aktivierungsschritt nach der Registrierung — Lücken kosten Leader.',
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
        text: `Du bist nur noch ${missing} aktive Firstline(s) von TeamLeader entfernt.`,
        why: 'Qualifikation in Reichweite — Firstlines aktiv halten schlägt kurzfristige Hektik.',
        severity: 'medium',
      });
    }
  }

  if (input.pendingShareProofs > 0) {
    msgs.push({
      id: 'mgr-ap',
      text: `${input.pendingShareProofs} AP-Nachweis(e) warten noch auf Bestätigung.`,
      why: 'AP-Integrität: Pending → Verified. Kein Fake-AP, keine Doppelvergabe.',
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
        text: `Die Linie von ${strong.name} wächst deutlich schneller als die von ${weak.name}.`,
        why: 'Ungleiche Legs sind normal — die schwächere Linie braucht Coaching, nicht Ignorieren.',
        severity: 'medium',
      });
    }
  }

  if (teamHealth.grade === 'excellent' || teamHealth.grade === 'healthy') {
    msgs.push({
      id: 'mgr-healthy',
      text: 'Die Sponsor-Hierarchie wirkt gesund.',
      why: teamHealth.why[0] ?? 'Aktivität und Follow-up-Disziplin halten die Struktur stabil.',
      severity: 'low',
    });
  }

  if ((input.dashboard?.activeToday ?? 0) >= 3) {
    msgs.push({
      id: 'mgr-congrats',
      text: 'Glückwunsch — deine Organisation ist diese Woche spürbar aktiver.',
      why: `${input.dashboard?.activeToday ?? 0} Partner heute aktiv — erkenne das Team, bevor du nur Zahlen pushst.`,
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
  const managerMessages = buildManagerMessages(input, priorities, teamHealth);

  return {
    greeting: `Guten Morgen, ${name}.`,
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

  const managerMessages = buildManagerMessages(input, priorities, teamHealth);

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
  const teamHealth = assessOrgHealth(input);
  const branchHealth = assessBranchHealth(input.partners, input.now);
  const priorities = buildPriorities(input);
  const onboarding = buildOnboardingLifecycle(input.partners, input.now);
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
      return buildPersonInsight(p, input.now, { directsNeedingHelp });
    });
  const followUps = buildFollowUpRecommendations(input.contacts, input.now);
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
    executive: buildExecutiveIntelligence(input, teamHealth, priorities),
  };
}

export function isMorningWindow(now: Date): boolean {
  const h = now.getHours();
  return h < 17;
}
