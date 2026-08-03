import type { ReactNode } from 'react';
import type { ExecutiveIntelligence } from './types';

/**
 * Compact Executive Intelligence block — scores always with WHY.
 * Additive under the existing COO briefing.
 */
export function ExecutiveIntelligencePanel({ executive }: { executive: ExecutiveIntelligence }) {
  return (
    <div className="space-y-2 rounded-xl border border-line bg-bg/60 px-2.5 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        Executive Intelligence
      </p>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <ScoreChip
          label="Momentum"
          score={executive.momentum.score}
          status={executive.momentum.label}
          why={executive.momentum.why[0]}
        />
        <ScoreChip
          label="Leadership"
          score={executive.leadership.score}
          status={executive.leadership.label}
          why={executive.leadership.why[0]}
        />
      </div>

      <Section title="What happened?">
        {executive.whatHappened.slice(0, 2).map((i) => (
          <Line key={i.id} title={i.headline} why={i.why} />
        ))}
      </Section>

      <Section title="Why?">
        {executive.whyItMatters.slice(0, 2).map((i) => (
          <Line key={i.id} title={i.headline} why={i.why} />
        ))}
      </Section>

      <Section title="What should I do today?">
        {executive.whatToDoToday.slice(0, 3).map((i) => (
          <Line key={i.id} title={i.headline} why={i.why} />
        ))}
      </Section>

      {executive.bottlenecks[0] ? (
        <Section title="Bottleneck">
          <Line
            title={executive.bottlenecks[0].title}
            why={`${executive.bottlenecks[0].why} → ${executive.bottlenecks[0].unlock}`}
          />
        </Section>
      ) : null}

      {executive.roiRecommendations[0] ? (
        <Section title="ROI">
          <Line
            title={executive.roiRecommendations[0].action}
            why={`${executive.roiRecommendations[0].why} · ${executive.roiRecommendations[0].expectedLift}`}
          />
        </Section>
      ) : null}

      {executive.leadershipDna[0] ? (
        <Section title="Leadership DNA">
          <Line
            title={executive.leadershipDna[0].trait}
            why={`${executive.leadershipDna[0].evidence} — ${executive.leadershipDna[0].why}`}
          />
        </Section>
      ) : null}

      {executive.forecast[0] ? (
        <Section title="Forecast">
          <Line title={executive.forecast[0].title} why={executive.forecast[0].why} />
        </Section>
      ) : null}

      {executive.timeline.length > 0 ? (
        <Section title="Executive Timeline">
          {executive.timeline.slice(0, 3).map((t) => (
            <Line key={t.id} title={t.title} why={t.why} />
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function ScoreChip({
  label,
  score,
  status,
  why,
}: {
  label: string;
  score: number;
  status: string;
  why?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-2 py-1.5">
      <p className="font-semibold text-ink">
        {label} · {score}
      </p>
      <p className="text-[11px] text-muted">{status}</p>
      {why ? <p className="mt-0.5 text-[11px] text-muted">Warum: {why}</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1 border-t border-line/80 pt-1.5">
      <p className="text-[11px] font-semibold text-accent-deep">{title}</p>
      {children}
    </div>
  );
}

function Line({ title, why }: { title: string; why: string }) {
  return (
    <div>
      <p className="text-sm font-medium leading-snug text-ink">{title}</p>
      <p className="text-xs text-muted">Warum: {why}</p>
    </div>
  );
}
