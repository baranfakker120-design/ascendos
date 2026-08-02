/**
 * Reine Präsentationshilfe für Rangfortschritt.
 *
 * Die fachliche Rangermittlung bleibt in der Datenbank
 * (`rank_for_ap` / `next_rank_for_ap`). Hier wird nur der
 * Fortschrittsanteil zwischen zwei bekannten Schwellen gerechnet —
 * keine zweite Wahrheit, keine Schwellen-Kataloglogik.
 */

export interface RankProgressInput {
  /** Aktueller AP-Stand (memberships.ap_total). */
  ap: number;
  /** threshold_ap des aktuellen Rangs (rank_for_ap). */
  currentThreshold: number;
  /**
   * threshold_ap des nächsten Rangs (next_rank_for_ap).
   * null/undefined = höchster Rang erreicht.
   */
  nextThreshold: number | null | undefined;
}

export interface RankProgress {
  /** 0..1, geklemmt. Bei höchstem Rang immer 1. */
  ratio: number;
  /** Fehlende AP bis zur nächsten Schwelle; 0 am Ende. */
  remainingAp: number;
  /** true, wenn keine höhere Schwelle existiert. */
  isMaxRank: boolean;
}

/** Fortschritt zwischen aktueller und nächster Schwelle. */
export function computeRankProgress(input: RankProgressInput): RankProgress {
  const ap = Math.max(0, Math.floor(input.ap));
  const current = Math.max(0, Math.floor(input.currentThreshold));
  const next =
    input.nextThreshold == null ? null : Math.max(0, Math.floor(input.nextThreshold));

  if (next == null || next <= current) {
    return { ratio: 1, remainingAp: 0, isMaxRank: true };
  }

  const span = next - current;
  const gained = Math.min(Math.max(ap - current, 0), span);
  const remainingAp = Math.max(next - ap, 0);

  return {
    ratio: gained / span,
    remainingAp,
    isMaxRank: false,
  };
}

/**
 * Prozentwert für CSS-Breiten (0–100), ohne Rundungsartefakte unter 0/über 100.
 * Keine Animation — nur die Zahl.
 */
export function rankProgressPercent(progress: RankProgress): number {
  if (progress.isMaxRank) return 100;
  return Math.round(progress.ratio * 1000) / 10;
}
