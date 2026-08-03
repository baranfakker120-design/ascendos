import { useMemo } from 'react';
import { useI18n } from '@shared/i18n';
import type { LeaderDashboard } from '../types';
import './leader-surface.css';

function formatValue(value: number, format: 'ap' | 'pct' | undefined, locale: string): string {
  if (format === 'pct') return `${Math.round(value)}%`;
  if (format === 'ap') return value.toLocaleString(locale);
  return String(value);
}

interface LeaderDashboardStripProps {
  data: LeaderDashboard | undefined;
  loading?: boolean;
}

export function LeaderDashboardStrip({ data, loading }: LeaderDashboardStripProps) {
  const { t, locale } = useI18n();
  const cards = useMemo(
    () =>
      [
        { key: 'activeToday' as const, label: t('leadership.activeToday') },
        { key: 'newRegistrationsMonth' as const, label: t('leadership.newPartners') },
        { key: 'newCustomersMonth' as const, label: t('leadership.newCustomers') },
        { key: 'openFollowups' as const, label: t('leadership.openFollowUps') },
        { key: 'teamAp' as const, label: t('leadership.teamAp'), format: 'ap' as const },
        { key: 'icpMonth' as const, label: t('leadership.icp'), format: 'ap' as const },
        { key: 'monthGoalAp' as const, label: t('leadership.monthGoal'), format: 'ap' as const },
        { key: 'goalProgress' as const, label: t('leadership.goalProgress'), format: 'pct' as const },
      ] satisfies Array<{
        key: keyof LeaderDashboard;
        label: string;
        format?: 'ap' | 'pct';
      }>,
    [t]
  );

  return (
    <section className="leader-dash" aria-label={t('leadership.dashboard')}>
      <div className="leader-dash__rail">
        {cards.map((card, i) => {
          const raw = data ? Number(data[card.key]) : 0;
          return (
            <article
              key={card.key}
              className="leader-glass leader-dash__card"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <p className="leader-dash__label">{card.label}</p>
              <p className="leader-dash__value">
                {loading && !data ? '…' : formatValue(raw, card.format, locale)}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
