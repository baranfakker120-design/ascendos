/**
 * AAA Game-Design AP-Scoring.
 *
 * Bewertet Aktionen über fünf Dimensionen und mappt auf Reward-Tiers.
 * Eine Wahrheit für UI-Badges und (via Migration) DB-Vergabe.
 */

export type ApScoreDimensions = {
  /** 0–1: wie schwer / riskant */
  difficulty: number;
  /** 0–1: Zeitaufwand */
  duration: number;
  /** 0–1: Business-Hebel */
  businessImpact: number;
  /** 0–1: Dringlichkeit / Fokus */
  priority: number;
  /** 0–1: Seltenheit / Meilenstein-Charakter */
  rarity: number;
};

export type ApRewardTier = 10 | 25 | 50 | 75 | 100 | 150 | 250 | 500;

/** Gewichtete Dimensionen — Impact und Rarity treiben den Perceived Value. */
const WEIGHTS: Record<keyof ApScoreDimensions, number> = {
  difficulty: 0.15,
  duration: 0.1,
  businessImpact: 0.35,
  priority: 0.15,
  rarity: 0.25,
};

/** Reward-Leiter (Game economy). */
export const AP_REWARD_TIERS: readonly ApRewardTier[] = [
  10, 25, 50, 75, 100, 150, 250, 500,
] as const;

const PROFILE: Record<string, ApScoreDimensions> = {
  // Pipeline
  // Kalibriert an Game-Economy-Beispielen (Kontakt 10 → Partner 500).
  'pipeline:contact_created': {
    difficulty: 0.12,
    duration: 0.12,
    businessImpact: 0.18,
    priority: 0.35,
    rarity: 0.08,
  },
  'pipeline:first_touch': {
    difficulty: 0.3,
    duration: 0.3,
    businessImpact: 0.35,
    priority: 0.45,
    rarity: 0.18,
  },
  'pipeline:follow_up': {
    difficulty: 0.35,
    duration: 0.3,
    businessImpact: 0.42,
    priority: 0.55,
    rarity: 0.22,
  },
  'pipeline:presentation_sent': {
    difficulty: 0.35,
    duration: 0.28,
    businessImpact: 0.55,
    priority: 0.5,
    rarity: 0.35,
  },
  'pipeline:presentation_viewed': {
    difficulty: 0.2,
    duration: 0.15,
    businessImpact: 0.62,
    priority: 0.55,
    rarity: 0.4,
  },
  'pipeline:fit_check_sent': {
    difficulty: 0.38,
    duration: 0.32,
    businessImpact: 0.58,
    priority: 0.55,
    rarity: 0.38,
  },
  'pipeline:fit_check_completed': {
    difficulty: 0.55,
    duration: 0.5,
    businessImpact: 0.78,
    priority: 0.65,
    rarity: 0.55,
  },
  'pipeline:waytomoon_sent': {
    difficulty: 0.35,
    duration: 0.28,
    businessImpact: 0.6,
    priority: 0.5,
    rarity: 0.42,
  },
  'pipeline:three_way_call_done': {
    difficulty: 0.72,
    duration: 0.68,
    businessImpact: 0.88,
    priority: 0.78,
    rarity: 0.75,
  },
  'pipeline:party_scheduled': {
    difficulty: 0.48,
    duration: 0.42,
    businessImpact: 0.72,
    priority: 0.6,
    rarity: 0.55,
  },
  'pipeline:party_done': {
    difficulty: 0.68,
    duration: 0.75,
    businessImpact: 0.82,
    priority: 0.68,
    rarity: 0.7,
  },
  'pipeline:became_customer': {
    difficulty: 0.62,
    duration: 0.48,
    businessImpact: 0.92,
    priority: 0.72,
    rarity: 0.8,
  },
  'pipeline:registered': {
    difficulty: 0.88,
    duration: 0.72,
    businessImpact: 1,
    priority: 0.92,
    rarity: 0.98,
  },

  // Missions (Tagesplan)
  'mission:new_contacts': {
    difficulty: 0.22,
    duration: 0.3,
    businessImpact: 0.28,
    priority: 0.4,
    rarity: 0.12,
  },
  'mission:follow_up_overdue': {
    difficulty: 0.38,
    duration: 0.35,
    businessImpact: 0.42,
    priority: 0.7,
    rarity: 0.22,
  },
  'mission:reactivate_contact': {
    difficulty: 0.42,
    duration: 0.35,
    businessImpact: 0.4,
    priority: 0.6,
    rarity: 0.28,
  },
  'mission:presentation_pending': {
    difficulty: 0.38,
    duration: 0.32,
    businessImpact: 0.55,
    priority: 0.58,
    rarity: 0.35,
  },
  'mission:next_step_due': {
    difficulty: 0.35,
    duration: 0.3,
    businessImpact: 0.42,
    priority: 0.65,
    rarity: 0.22,
  },
  'mission:fit_check_next_step': {
    difficulty: 0.55,
    duration: 0.5,
    businessImpact: 0.72,
    priority: 0.7,
    rarity: 0.52,
  },

  // Usage
  'usage:coach_message_sent': {
    difficulty: 0.18,
    duration: 0.22,
    businessImpact: 0.28,
    priority: 0.35,
    rarity: 0.1,
  },
  'usage:plan_committed': {
    difficulty: 0.12,
    duration: 0.12,
    businessImpact: 0.3,
    priority: 0.45,
    rarity: 0.18,
  },
  'usage:journey_step_completed': {
    difficulty: 0.28,
    duration: 0.35,
    businessImpact: 0.35,
    priority: 0.4,
    rarity: 0.32,
  },
  'usage:app_opened': {
    difficulty: 0.04,
    duration: 0.04,
    businessImpact: 0.08,
    priority: 0.15,
    rarity: 0.04,
  },
  'usage:mission_skipped': {
    difficulty: 0,
    duration: 0,
    businessImpact: 0,
    priority: 0,
    rarity: 0,
  },
};

/** Gewichteter Roh-Score 0–1. */
export function scoreDimensions(d: ApScoreDimensions): number {
  let sum = 0;
  let w = 0;
  for (const key of Object.keys(WEIGHTS) as (keyof ApScoreDimensions)[]) {
    const v = Math.min(1, Math.max(0, d[key]));
    sum += v * WEIGHTS[key];
    w += WEIGHTS[key];
  }
  return w > 0 ? sum / w : 0;
}

/**
 * Snap auf die Reward-Leiter.
 * Bänder kalibriert wie ein Economy-Pass (Duolingo/Supercell-Feeling).
 */
export function snapToApTier(raw01: number): ApRewardTier {
  const r = Math.min(1, Math.max(0, raw01));
  if (r < 0.2) return 10;
  if (r < 0.32) return 25;
  if (r < 0.44) return 50;
  if (r < 0.54) return 75;
  if (r < 0.64) return 100;
  if (r < 0.74) return 150;
  if (r < 0.86) return 250;
  return 500;
}

export function scoreAction(profileKey: string): ApRewardTier {
  const profile = PROFILE[profileKey];
  if (!profile) return 25;
  const raw = scoreDimensions(profile);
  if (raw <= 0) return 10;
  return snapToApTier(raw);
}

export function scorePipelineEvent(eventType: string): ApRewardTier {
  if (eventType === 'correction') return 10;
  return scoreAction(`pipeline:${eventType}`);
}

export function scoreMission(missionType: string): ApRewardTier {
  return scoreAction(`mission:${missionType}`);
}

export function scoreUsageEvent(eventType: string, meta?: { mission_type?: string }): ApRewardTier {
  if (eventType === 'mission_completed' && meta?.mission_type) {
    return scoreMission(meta.mission_type);
  }
  if (eventType === 'mission_skipped') return 10; // display only; DB awards 0
  return scoreAction(`usage:${eventType}`);
}

/**
 * Lead / Kontakt-Wert für Reward-Sticker.
 * Spätere Pipeline-Phasen = höhere Belohnung bei Bearbeitung.
 */
export function scoreLeadPhase(phase: string): ApRewardTier {
  const map: Record<string, ApRewardTier> = {
    lead: 50,
    im_gespraech: 75,
    praesentation_offen: 100,
    praesentation: 100,
    fit_check: 150,
    three_way_call: 250,
    kunde: 250,
    partner: 500,
  };
  return map[phase] ?? 50;
}

/** Sticker-Emoji / Mark je nach Tier. */
export function rewardMark(ap: number): 'spark' | 'fire' | 'star' | 'crown' {
  if (ap >= 500) return 'crown';
  if (ap >= 150) return 'star';
  if (ap >= 50) return 'fire';
  return 'spark';
}

export function rewardMarkGlyph(ap: number): string {
  switch (rewardMark(ap)) {
    case 'crown':
      return '👑';
    case 'star':
      return '⭐';
    case 'fire':
      return '🔥';
    default:
      return '✦';
  }
}

/**
 * Combo-Bonus: Serien im Tagesplan.
 * 3 erledigt → +25, 5 → +50, 7+ → +100
 */
export function comboBonusAp(missionsDoneToday: number): ApRewardTier | 0 {
  if (missionsDoneToday >= 7) return 100;
  if (missionsDoneToday >= 5) return 50;
  if (missionsDoneToday >= 3) return 25;
  return 0;
}

/**
 * Bulk-Bonus: mehrere Kontakte anlegen in einer Session.
 * 3+ → +25, 5+ → +75
 */
export function bulkContactBonusAp(contactsCreatedInSession: number): ApRewardTier | 0 {
  if (contactsCreatedInSession >= 5) return 75;
  if (contactsCreatedInSession >= 3) return 25;
  return 0;
}

/** Alle Pipeline-Scores für Migration / Audit. */
export function allPipelineScores(): Record<string, ApRewardTier> {
  const keys = [
    'contact_created',
    'first_touch',
    'follow_up',
    'presentation_sent',
    'presentation_viewed',
    'fit_check_sent',
    'fit_check_completed',
    'waytomoon_sent',
    'three_way_call_done',
    'party_scheduled',
    'party_done',
    'became_customer',
    'registered',
  ];
  return Object.fromEntries(keys.map((k) => [k, scorePipelineEvent(k)])) as Record<
    string,
    ApRewardTier
  >;
}

export function allMissionScores(): Record<string, ApRewardTier> {
  const keys = [
    'fit_check_next_step',
    'next_step_due',
    'presentation_pending',
    'follow_up_overdue',
    'reactivate_contact',
    'new_contacts',
  ];
  return Object.fromEntries(keys.map((k) => [k, scoreMission(k)])) as Record<string, ApRewardTier>;
}
