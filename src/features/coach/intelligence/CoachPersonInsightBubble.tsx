import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@shared/i18n';
import { recordCeoRecommendation } from './ceoMemory';
import type { InsightPlacement } from './insightPlacement';
import type { PersonCoachInsight } from './types';
import './coach-insight-bubble.css';

interface Props {
  insight: PersonCoachInsight;
  /** Controlled open — only one tree insight at a time. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placement: InsightPlacement;
  /** Optional: open coach with a focused question. */
  onAsk?: (text: string) => void;
}

/**
 * Thought-bubble on a genealogy node.
 * Popover portals into the profile card so it is anchored in tree-world
 * coordinates (moves/scales with pan/zoom) — not a fixed screen popup.
 */
export function CoachPersonInsightBubble({ insight, open, onOpenChange, placement, onAsk }: Props) {
  const { t } = useI18n();
  const titleId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const [enterTick, setEnterTick] = useState(0);

  useLayoutEffect(() => {
    const node = btnRef.current?.closest('[data-membership-id]');
    setAnchor(node instanceof HTMLElement ? node : null);
  }, [open]);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setEnterTick((n) => n + 1);
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!enterTick) return;
    const timer = window.setTimeout(() => setEnterTick(0), 220);
    return () => window.clearTimeout(timer);
  }, [enterTick]);

  useEffect(() => {
    if (!open) return;
    recordCeoRecommendation(`person-${insight.membershipId}`, insight.headline, 'shown');
  }, [open, insight.membershipId, insight.headline]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const popover =
    open && anchor
      ? createPortal(
          <div
            id={titleId}
            role="dialog"
            data-tree-insight=""
            data-enter={enterTick || undefined}
            aria-label={t('coach.personAnalysis', { name: insight.name })}
            className={`coach-insight__pop coach-insight__pop--${placement}`}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="coach-insight__pointer" aria-hidden />
            <header className="coach-insight__head">
              <p className="coach-insight__name">{insight.name}</p>
              <button
                type="button"
                className="coach-insight__close"
                aria-label={t('common.close')}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenChange(false);
                }}
              >
                ✕
              </button>
            </header>

            <p className="coach-insight__label">{t('coach.personLage')}</p>
            <p className="coach-insight__text">{insight.currentSituation}</p>

            <p className="coach-insight__label">{t('coach.personNext')}</p>
            <p className="coach-insight__text coach-insight__text--strong">
              {insight.nextBestAction}
            </p>
            <p className="coach-insight__muted">{insight.nextBestActionWhy}</p>

            {insight.possibleObjection ? (
              <>
                <p className="coach-insight__label">{t('coach.possibleObjectionLabel')}</p>
                <p className="coach-insight__text">{insight.possibleObjection}</p>
              </>
            ) : null}

            <p className="coach-insight__label">{t('coach.whatsappSuggestion')}</p>
            <p className="coach-insight__whatsapp">{insight.suggestedWhatsApp}</p>

            <div className="coach-insight__stats">
              <div>
                <p className="coach-insight__stat-val">{insight.probabilityOfRegistration}%</p>
                <p className="coach-insight__stat-lbl">{t('coach.regShort')}</p>
              </div>
              <div>
                <p className="coach-insight__stat-val">{insight.probabilityOfInactivity}%</p>
                <p className="coach-insight__stat-lbl">{t('coach.inactiveShort')}</p>
              </div>
              <div>
                <p className="coach-insight__stat-val">{insight.riskScore}</p>
                <p className="coach-insight__stat-lbl">{t('coach.riskShort')}</p>
              </div>
            </div>

            {insight.strengths.length > 0 ? (
              <p className="coach-insight__muted">
                {t('coach.strengthsPrefix', { list: insight.strengths.join(' · ') })}
              </p>
            ) : null}
            {insight.weaknesses.length > 0 ? (
              <p className="coach-insight__muted">
                {t('coach.weaknessesPrefix', { list: insight.weaknesses.join(' · ') })}
              </p>
            ) : null}

            <p className="coach-insight__sponsor">
              <span className="coach-insight__text--strong">{t('coach.sponsor')} </span>
              {insight.sponsorRecommendation}
            </p>

            {onAsk ? (
              <button
                type="button"
                className="coach-insight__ask"
                onClick={() => {
                  recordCeoRecommendation(
                    `person-${insight.membershipId}`,
                    insight.headline,
                    'shown'
                  );
                  onAsk(
                    t('coach.personAsk', {
                      name: insight.name,
                      why: insight.nextBestActionWhy,
                      action: insight.nextBestAction,
                    })
                  );
                }}
              >
                {t('coach.askAscent')}
              </button>
            ) : null}
          </div>,
          anchor
        )
      : null;

  return (
    <div className="coach-insight">
      <button
        ref={btnRef}
        type="button"
        className="coach-insight__trigger"
        data-tree-coach=""
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
        title={t('coach.askAboutPerson', { name: insight.name })}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onOpenChange(!open);
        }}
      >
        💭
      </button>
      {popover}
    </div>
  );
}
