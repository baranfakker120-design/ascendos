import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { recordCeoRecommendation } from './ceoMemory';
import type { PersonCoachInsight } from './types';

interface Props {
  insight: PersonCoachInsight;
  /** Optional: open coach with a focused question. */
  onAsk?: (text: string) => void;
}

/**
 * Thought-bubble icon for a single genealogy/team member.
 * Popover uses a portal so tree card overflow does not clip it.
 */
export function CoachPersonInsightBubble({ insight, onAsk }: Props) {
  const titleId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const width = 272;
    const left = Math.min(
      Math.max(8, r.left + r.width / 2 - width / 2),
      window.innerWidth - width - 8
    );
    const top = Math.min(r.bottom + 8, window.innerHeight - 320);
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    recordCeoRecommendation(`person-${insight.membershipId}`, insight.headline, 'shown');
  }, [open, insight.membershipId, insight.headline]);

  return (
    <div className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-accent/40 bg-accent/15 px-1 text-[11px] leading-none text-accent-deep"
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
        title={`Ascent zu ${insight.name}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        💭
      </button>
      {open
        ? createPortal(
            <div
              id={titleId}
              role="dialog"
              aria-label={`Ascent Analyse ${insight.name}`}
              className="fixed z-[90] w-[272px] rounded-xl border border-line bg-surface p-3 shadow-lg"
              style={{ top: pos.top, left: pos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs font-semibold">{insight.name}</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                Aktuelle Lage
              </p>
              <p className="text-xs text-ink">{insight.currentSituation}</p>

              <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                Nächster Schritt
              </p>
              <p className="text-xs font-medium text-ink">{insight.nextBestAction}</p>
              <p className="mt-0.5 text-[11px] text-muted">{insight.nextBestActionWhy}</p>

              {insight.possibleObjection ? (
                <>
                  <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                    Möglicher Einwand
                  </p>
                  <p className="text-xs text-ink">{insight.possibleObjection}</p>
                </>
              ) : null}

              <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                WhatsApp-Vorschlag
              </p>
              <p className="whitespace-pre-wrap text-[11px] text-ink">
                {insight.suggestedWhatsApp}
              </p>

              <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
                <div className="rounded-lg bg-bg px-1 py-1">
                  <p className="font-semibold text-ink">{insight.probabilityOfRegistration}%</p>
                  <p className="text-muted">Reg.</p>
                </div>
                <div className="rounded-lg bg-bg px-1 py-1">
                  <p className="font-semibold text-ink">{insight.probabilityOfInactivity}%</p>
                  <p className="text-muted">Inaktiv</p>
                </div>
                <div className="rounded-lg bg-bg px-1 py-1">
                  <p className="font-semibold text-ink">{insight.riskScore}</p>
                  <p className="text-muted">Risiko</p>
                </div>
              </div>

              {insight.strengths.length > 0 ? (
                <p className="mt-2 text-[11px] text-muted">
                  Stärken: {insight.strengths.join(' · ')}
                </p>
              ) : null}
              {insight.weaknesses.length > 0 ? (
                <p className="text-[11px] text-muted">
                  Schwächen: {insight.weaknesses.join(' · ')}
                </p>
              ) : null}

              <p className="mt-2 text-[11px] text-ink">
                <span className="font-semibold">Sponsor: </span>
                {insight.sponsorRecommendation}
              </p>

              <div className="mt-2 flex justify-between gap-2">
                {onAsk ? (
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-primary"
                    onClick={() => {
                      recordCeoRecommendation(
                        `person-${insight.membershipId}`,
                        insight.headline,
                        'shown'
                      );
                      onAsk(
                        `Als Geschäftsführer zu ${insight.name}: ${insight.nextBestActionWhy} Nächster Schritt: ${insight.nextBestAction}`
                      );
                    }}
                  >
                    Ascent fragen
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className="text-[11px] font-semibold text-muted"
                  onClick={() => setOpen(false)}
                >
                  Schließen
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
