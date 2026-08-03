import { useEffect, useId, useState } from 'react';
import { filterManagerMessagesByMemory, recordCeoRecommendation } from './ceoMemory';
import type {
  BranchHealthGrade,
  CoachOrgIntelligence,
  CoachPriorityInsight,
  ManagerMessage,
} from './types';

const GRADE_COPY: Record<BranchHealthGrade, string> = {
  excellent: 'Excellent',
  healthy: 'Healthy',
  growing: 'Growing',
  needs_attention: 'Needs Attention',
  critical: 'Critical',
};

interface Props {
  intelligence: CoachOrgIntelligence | null;
  isMorning: boolean;
  isLoading?: boolean;
  /** Prefill coach composer with a priority prompt — does not auto-send. */
  onAskAbout?: (text: string) => void;
}

/**
 * Compact COO briefing above the chat thread.
 * Does not alter CoachBubbles / Markdown / composer layout contracts.
 */
export function CoachBriefingPanel({ intelligence, isMorning, isLoading, onAskAbout }: Props) {
  const titleId = useId();
  const [open, setOpen] = useState(true);

  const managerMessages: ManagerMessage[] = intelligence
    ? filterManagerMessagesByMemory(intelligence.managerMessages)
    : [];

  useEffect(() => {
    for (const m of managerMessages.slice(0, 3)) {
      recordCeoRecommendation(m.id, m.text, 'shown');
    }
    // Only when intelligence identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intelligence?.generatedAt]);

  if (isLoading && !intelligence) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-3 py-2 text-xs text-muted">
        Ascent liest die Organisationslage …
      </div>
    );
  }

  if (!intelligence) return null;

  const report = isMorning ? intelligence.briefing : intelligence.evening;
  const health = intelligence.teamHealth;
  const priorities: CoachPriorityInsight[] = isMorning
    ? intelligence.briefing.priorities
    : intelligence.surfaceInsights;

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-2xl border border-line bg-surface px-3 py-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p id={titleId} className="text-sm font-semibold leading-snug">
            {isMorning ? report.greeting : (report as typeof intelligence.evening).greeting}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Team: {GRADE_COPY[health.grade]} · {health.score}/100
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 text-xs font-semibold text-accent-deep"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? 'Weniger' : 'Lage'}
        </button>
      </div>

      {open ? (
        <div className="mt-2 space-y-2">
          <ul className="space-y-1 text-xs text-muted">
            {health.why.slice(0, 2).map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>

          {managerMessages.length > 0 ? (
            <div className="space-y-1.5 rounded-xl border border-accent/20 bg-accent/5 px-2.5 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-deep">
                Geschäftsführer-Hinweis
              </p>
              {managerMessages.slice(0, 3).map((m) => (
                <div key={m.id}>
                  <p className="text-sm font-medium leading-snug text-ink">{m.text}</p>
                  <p className="text-xs text-muted">Warum: {m.why}</p>
                </div>
              ))}
            </div>
          ) : null}

          {isMorning ? (
            <ul className="space-y-1 text-xs">
              {intelligence.briefing.yesterdaySummary.slice(0, 4).map((line) => (
                <li key={line} className="text-ink">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-1 text-xs">
              {(report as typeof intelligence.evening).todaysWins.slice(0, 3).map((line) => (
                <p key={line} className="text-ink">
                  ✓ {line}
                </p>
              ))}
              {(report as typeof intelligence.evening).missedOpportunities
                .slice(0, 2)
                .map((line) => (
                  <p key={line} className="text-muted">
                    · {line}
                  </p>
                ))}
            </div>
          )}

          {priorities.length > 0 ? (
            <div className="space-y-1.5 border-t border-line pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {isMorning ? 'Höchste Priorität' : 'Morgen'}
              </p>
              {priorities.slice(0, 3).map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{p.title}</p>
                    <p className="text-xs text-muted">Warum: {p.why}</p>
                  </div>
                  {onAskAbout ? (
                    <button
                      type="button"
                      className="shrink-0 text-xs font-semibold text-primary"
                      onClick={() =>
                        onAskAbout(
                          `Als mein Geschäftsführer: Priorisiere und gib mir den nächsten Schritt zu „${p.title}". Warum: ${p.why}`
                        )
                      }
                    >
                      Fragen
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
