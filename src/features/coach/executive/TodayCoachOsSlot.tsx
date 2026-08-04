import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { useCoachOrgIntelligence } from '../intelligence';
import { writePendingSeed } from '../workspace';
import {
  buildProactiveSuggestions,
  filterByHorizon,
  type SuggestionHorizon,
} from './proactiveSuggestions';
import './executive.css';

const HORIZONS: SuggestionHorizon[] = ['today', 'week', 'month'];

/**
 * Home Coach OS strip — proactive suggestions for Today / Week / Month.
 * Opens Coach with a durable seed (localStorage), no engine changes.
 */
export function TodayCoachOsSlot() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { intelligence, isLoading } = useCoachOrgIntelligence(true);
  const [horizon, setHorizon] = useState<SuggestionHorizon>('today');

  const all = useMemo(() => buildProactiveSuggestions(intelligence, t), [intelligence, t]);
  const visible = useMemo(() => filterByHorizon(all, horizon), [all, horizon]);

  const openCoach = (prompt: string, kind: 'ceo' | 'leadership' | 'general' = 'ceo') => {
    writePendingSeed(prompt);
    void navigate(`/coach?kind=${kind}`);
  };

  return (
    <section className="exec-coach" aria-label={t('coach.exec.homeTitle')}>
      <div className="exec-coach__head">
        <div>
          <p className="exec-coach__eyebrow">{t('coach.name')}</p>
          <h2 className="exec-coach__title">{t('coach.exec.homeTitle')}</h2>
          <p className="exec-coach__body">{t('coach.exec.homeBody')}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          fullWidth={false}
          onClick={() => openCoach(t('coach.exec.suggestTodayFocusPrompt'), 'ceo')}
        >
          {t('coach.exec.openWorkspace')}
        </Button>
      </div>

      <div
        className="exec-coach__horizons"
        role="tablist"
        aria-label={t('coach.exec.horizonLabel')}
      >
        {HORIZONS.map((h) => (
          <button
            key={h}
            type="button"
            role="tab"
            aria-selected={horizon === h}
            className={`exec-coach__horizon${horizon === h ? ' is-on' : ''}`}
            onClick={() => setHorizon(h)}
          >
            {t(`coach.exec.horizon.${h}`)}
          </button>
        ))}
      </div>

      {isLoading && !intelligence ? (
        <p className="exec-coach__loading">{t('coach.briefingLoading')}</p>
      ) : (
        <div className="exec-coach__chips">
          {visible.map((s) => (
            <button
              key={s.id}
              type="button"
              className="exec-coach__chip"
              onClick={() => openCoach(s.prompt)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
