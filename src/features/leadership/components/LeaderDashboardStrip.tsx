import type { LeaderDashboard } from '../types';
import './leader-surface.css';

const CARDS: Array<{ key: keyof LeaderDashboard; label: string; format?: 'ap' | 'pct' }> = [
  { key: 'activeToday', label: 'Aktiv heute' },
  { key: 'newRegistrationsMonth', label: 'Neue Partner' },
  { key: 'newCustomersMonth', label: 'Neue Kunden' },
  { key: 'openFollowups', label: 'Offene Follow-ups' },
  { key: 'teamAp', label: 'Team AP', format: 'ap' },
  { key: 'icpMonth', label: 'ICP', format: 'ap' },
  { key: 'monthGoalAp', label: 'Monatsziel', format: 'ap' },
  { key: 'goalProgress', label: 'Zielerreichung', format: 'pct' },
];

function formatValue(value: number, format?: 'ap' | 'pct'): string {
  if (format === 'pct') return `${Math.round(value)}%`;
  if (format === 'ap') return value.toLocaleString('de-DE');
  return String(value);
}

interface LeaderDashboardStripProps {
  data: LeaderDashboard | undefined;
  loading?: boolean;
}

export function LeaderDashboardStrip({ data, loading }: LeaderDashboardStripProps) {
  return (
    <section className="leader-dash" aria-label="Leader Dashboard">
      <div className="leader-dash__rail">
        {CARDS.map((card, i) => {
          const raw = data ? Number(data[card.key]) : 0;
          return (
            <article
              key={card.key}
              className="leader-glass leader-dash__card"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <p className="leader-dash__label">{card.label}</p>
              <p className="leader-dash__value">
                {loading && !data ? '…' : formatValue(raw, card.format)}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
