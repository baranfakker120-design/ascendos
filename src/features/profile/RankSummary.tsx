import { computeRankProgress, rankProgressPercent } from '@shared/lib/rankProgress';
import type { NextRankForAp, RankForAp } from '@shared/types/domain';

export interface RankSummaryProps {
  apTotal: number;
  current: RankForAp | null;
  next: NextRankForAp | null;
}

/**
 * AP-Stand, aktueller Rang und Fortschritt zur nächsten Schwelle.
 * Schwellen kommen von den RPCs — hier nur Anzeige.
 */
export function RankSummary({ apTotal, current, next }: RankSummaryProps) {
  const currentThreshold = current?.threshold_ap ?? 0;
  const progress = computeRankProgress({
    ap: apTotal,
    currentThreshold,
    nextThreshold: next?.threshold_ap ?? null,
  });
  const percent = rankProgressPercent(progress);
  const rankLabel = current?.label ?? 'Newcomer';

  return (
    <section className="space-y-3" aria-label="Punkte und Rang">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Rang</p>
          <p className="text-xl font-bold text-ink">{rankLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">AP</p>
          <p className="text-xl font-bold text-ink">{apTotal.toLocaleString('de-DE')}</p>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex justify-between gap-2 text-xs text-muted">
          {progress.isMaxRank ? (
            <span>Höchster Rang erreicht</span>
          ) : (
            <>
              <span>Nächster Rang: {next?.label}</span>
              <span>{progress.remainingAp.toLocaleString('de-DE')} AP bis dahin</span>
            </>
          )}
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-bg"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Fortschritt zum nächsten Rang"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </section>
  );
}
