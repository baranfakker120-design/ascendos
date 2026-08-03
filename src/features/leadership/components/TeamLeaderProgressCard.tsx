import { useEffect, useState } from 'react';
import type { TeamLeaderProgress } from '../types';
import './leader-surface.css';

interface TeamLeaderProgressCardProps {
  progress: TeamLeaderProgress | null | undefined;
}

export function TeamLeaderProgressCard({ progress }: TeamLeaderProgressCardProps) {
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (!progress?.qualified || !progress.qualifiedAt) return;
    const key = `tl-unlock-${progress.membershipId}-${progress.qualifiedAt}`;
    if (sessionStorage.getItem(key)) return;
    const age = Date.now() - new Date(progress.qualifiedAt).getTime();
    if (age < 7 * 86_400_000) {
      sessionStorage.setItem(key, '1');
      setCelebrate(true);
    }
  }, [progress]);

  if (!progress) return null;
  const pct = Math.min(
    100,
    Math.round((progress.activeFirstlines / Math.max(1, progress.requiredFirstlines)) * 100)
  );
  const missing = Math.max(0, progress.requiredFirstlines - progress.activeFirstlines);
  const euros = (progress.bonusAmountCents / 100).toLocaleString('de-DE');

  return (
    <>
      <section className="leader-tl leader-glass" aria-label="TeamLeader Fortschritt">
        <header>
          <h2>TeamLeader</h2>
          <p>
            {progress.qualified
              ? 'Qualifikation erreicht'
              : `${progress.activeFirstlines} / ${progress.requiredFirstlines} aktive Firstlines`}
          </p>
        </header>
        <div className="leader-tl__bar" role="progressbar" aria-valuenow={pct} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <dl className="leader-tl__meta">
          <div>
            <dt>Noch fehlend</dt>
            <dd>{missing}</dd>
          </div>
          <div>
            <dt>100 € Bonus</dt>
            <dd>
              {progress.qualified
                ? progress.bonusPaid
                  ? 'Ausgezahlt'
                  : 'Freigegeben'
                : `${euros} € Vorschau`}
            </dd>
          </div>
        </dl>
      </section>

      {celebrate ? (
        <div className="leader-unlock" role="dialog" aria-modal="true">
          <div className="leader-unlock__panel">
            <p className="leader-unlock__eyebrow">Freigeschaltet</p>
            <h3>TeamLeader</h3>
            <p>100 € Bonus freigegeben · Frame & Badge aktiv</p>
            <button type="button" onClick={() => setCelebrate(false)}>
              Weiterführen
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
