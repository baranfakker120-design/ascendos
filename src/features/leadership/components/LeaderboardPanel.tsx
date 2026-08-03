import { useState } from 'react';
import { useTeamLeaderboard } from '../leadershipApi';
import type { LeaderboardPeriod, LeaderboardSort } from '../types';
import './leader-surface.css';

const PERIODS: Array<{ id: LeaderboardPeriod; label: string }> = [
  { id: 'today', label: 'Heute' },
  { id: 'week', label: 'Diese Woche' },
  { id: 'month', label: 'Dieser Monat' },
  { id: 'year', label: 'Dieses Jahr' },
];

const SORTS: Array<{ id: LeaderboardSort; label: string }> = [
  { id: 'ap', label: 'AP' },
  { id: 'icp', label: 'ICP' },
  { id: 'new_partners', label: 'Neue Partner' },
  { id: 'sales', label: 'Verkäufe' },
  { id: 'activity', label: 'Aktivität' },
];

export function LeaderboardPanel() {
  const [period, setPeriod] = useState<LeaderboardPeriod>('month');
  const [sort, setSort] = useState<LeaderboardSort>('ap');
  const { data = [], isPending } = useTeamLeaderboard(period, sort);

  return (
    <section className="leader-board leader-glass" aria-label="Leaderboard">
      <header className="leader-board__head">
        <h2>Leaderboard</h2>
        <div className="leader-tabs" role="tablist">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={period === p.id}
              className={period === p.id ? 'is-active' : undefined}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="leader-tabs leader-tabs--sort" role="group" aria-label="Sortierung">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={sort === s.id ? 'is-active' : undefined}
              onClick={() => setSort(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>

      <ol className="leader-board__list">
        {isPending ? (
          <li className="leader-board__empty">Lade Rangliste …</li>
        ) : data.length === 0 ? (
          <li className="leader-board__empty">Noch keine Werte in diesem Zeitraum.</li>
        ) : (
          data.slice(0, 12).map((row, idx) => (
            <li key={row.membershipId} className="leader-board__row">
              <span className="leader-board__rank">{idx + 1}</span>
              <div className="leader-board__who">
                <p className="leader-board__name">
                  {`${row.firstName} ${row.lastName}`.trim() || 'Partner'}
                </p>
                <p className="leader-board__meta">{row.rankLabel ?? '—'}</p>
              </div>
              <span className="leader-board__metric">{row.metric.toLocaleString('de-DE')}</span>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
