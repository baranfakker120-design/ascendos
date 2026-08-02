import { computeRankProgress, rankProgressPercent } from '@shared/lib/rankProgress';

export type EnergyCoreSize = 'md' | 'lg';
export type EnergyCoreState = 'idle' | 'filled' | 'max';

export interface EnergyCoreProps {
  /** Aktueller AP-Stand. */
  ap: number;
  /** threshold_ap des aktuellen Rangs. */
  currentThreshold: number;
  /** threshold_ap des nächsten Rangs; null = höchster Rang. */
  nextThreshold: number | null;
  /** Optionaler Override; sonst aus Fortschritt abgeleitet. */
  state?: EnergyCoreState;
  size?: EnergyCoreSize;
  /** Label-Zeile und AP-Zahl anzeigen (Standard: true). */
  showLabel?: boolean;
  /** Anzeigename des nächsten Rangs (nur Text). */
  nextRankLabel?: string | null;
  className?: string;
}

/** AP-Anzeige mit deutschem Tausenderpunkt. */
export function formatEnergyAp(ap: number): string {
  return Math.max(0, Math.floor(ap)).toLocaleString('de-DE');
}

/** Sichtbarer Zustand aus Fortschritt, falls nicht übergeben. */
export function resolveEnergyCoreState(
  ratio: number,
  isMaxRank: boolean,
  override?: EnergyCoreState
): EnergyCoreState {
  if (override) return override;
  if (isMaxRank) return 'max';
  if (ratio > 0) return 'filled';
  return 'idle';
}

/**
 * Primäre AP→nächster-Rang-Anzeige (Kapsel-Track).
 * Technik-agnostische Props — später austauschbar hinter derselben API.
 * Keine Animation, kein Supabase.
 */
export function EnergyCore({
  ap,
  currentThreshold,
  nextThreshold,
  state: stateOverride,
  size = 'md',
  showLabel = true,
  nextRankLabel = null,
  className = '',
}: EnergyCoreProps) {
  const progress = computeRankProgress({
    ap,
    currentThreshold,
    nextThreshold,
  });
  const percent = rankProgressPercent(progress);
  const state = resolveEnergyCoreState(progress.ratio, progress.isMaxRank, stateOverride);
  const trackHeight = size === 'lg' ? 'h-3' : 'h-2.5';
  const apClass = size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <div className={`w-full ${className}`}>
      {showLabel ? (
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">AP</p>
            <p className={`font-bold tabular-nums text-ink ${apClass}`}>{formatEnergyAp(ap)}</p>
          </div>
          <div className="min-h-[2.5rem] text-right text-xs text-muted">
            {state === 'max' || progress.isMaxRank ? (
              <span>Höchster Rang erreicht</span>
            ) : (
              <>
                <span className="block">
                  Nächster Rang
                  {nextRankLabel ? `: ${nextRankLabel}` : ''}
                </span>
                <span className="mt-0.5 block tabular-nums">
                  {progress.remainingAp.toLocaleString('de-DE')} AP bis dahin
                </span>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div
        className={`overflow-hidden rounded-full bg-bg ${trackHeight}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Fortschritt zum nächsten Rang"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
