import { useId, useState } from 'react';
import type { PersonCoachInsight } from './types';

interface Props {
  insight: PersonCoachInsight;
  /** Optional: open coach with a focused question. */
  onAsk?: (text: string) => void;
}

/**
 * Small Coach insight bubble for a single person.
 * Owned by the Coach feature — genealogy may adopt later without engine changes.
 */
export function CoachPersonInsightBubble({ insight, onAsk }: Props) {
  const titleId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-accent/40 bg-accent/15 px-1.5 text-[10px] font-bold text-accent-deep"
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
        title={insight.headline}
        onClick={() => setOpen((v) => !v)}
      >
        A
      </button>
      {open ? (
        <div
          id={titleId}
          role="dialog"
          className="absolute left-0 top-7 z-20 w-56 rounded-xl border border-line bg-surface p-2.5 shadow-md"
        >
          <p className="text-xs font-semibold">{insight.name}</p>
          <p className="mt-0.5 text-xs text-ink">{insight.headline}</p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-muted">
            {insight.bullets.map((b) => (
              <li key={b}>· {b}</li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between gap-2">
            {onAsk ? (
              <button
                type="button"
                className="text-[11px] font-semibold text-primary"
                onClick={() =>
                  onAsk(
                    `Analysiere ${insight.name} als Geschäftsführer: ${insight.headline}. Gib mir den besten nächsten Schritt.`
                  )
                }
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
        </div>
      ) : null}
    </div>
  );
}
