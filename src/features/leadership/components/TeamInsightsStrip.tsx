import { useI18n } from '@shared/i18n';
import type { TeamInsight } from '../types';
import './leader-surface.css';

interface TeamInsightsStripProps {
  items: TeamInsight[];
  onSelect?: (membershipId: string) => void;
}

export function TeamInsightsStrip({ items, onSelect }: TeamInsightsStripProps) {
  const { t } = useI18n();
  if (!items.length) return null;
  return (
    <section className="leader-insights" aria-label={t('leadership.insights')}>
      <div className="leader-insights__rail">
        {items.map((item, i) => (
          <button
            key={`${item.kind}-${item.membershipId}`}
            type="button"
            className="leader-glass leader-insights__card"
            style={{ animationDelay: `${i * 50}ms` }}
            onClick={() => onSelect?.(item.membershipId)}
          >
            <span className="leader-insights__emoji" aria-hidden>
              {item.emoji}
            </span>
            <span className="leader-insights__title">{item.title}</span>
            <span className="leader-insights__name">{item.name}</span>
            <span className="leader-insights__detail">{item.detail}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
