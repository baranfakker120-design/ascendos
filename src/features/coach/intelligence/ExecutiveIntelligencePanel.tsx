import type { ReactNode } from 'react';
import { useI18n } from '@shared/i18n';
import type { ExecutiveIntelligence } from './types';

/**
 * Compact Executive Intelligence block — scores always with WHY.
 * Additive under the existing COO briefing.
 * Chrome labels only — insight content comes from the engine.
 */
export function ExecutiveIntelligencePanel({ executive }: { executive: ExecutiveIntelligence }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2 rounded-xl border border-line bg-bg/60 px-2.5 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {t('coach.execTitle')}
      </p>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <ScoreChip
          label={t('coach.momentum')}
          score={executive.momentum.score}
          status={executive.momentum.label}
          why={executive.momentum.why[0]}
        />
        <ScoreChip
          label={t('coach.leadership')}
          score={executive.leadership.score}
          status={executive.leadership.label}
          why={executive.leadership.why[0]}
        />
      </div>

      <Section title={t('coach.execWhat')}>
        {executive.whatHappened.slice(0, 2).map((i) => (
          <Line key={i.id} title={i.headline} why={i.why} />
        ))}
      </Section>

      <Section title={t('coach.execWhy')}>
        {executive.whyItMatters.slice(0, 2).map((i) => (
          <Line key={i.id} title={i.headline} why={i.why} />
        ))}
      </Section>

      <Section title={t('coach.execToday')}>
        {executive.whatToDoToday.slice(0, 3).map((i) => (
          <Line key={i.id} title={i.headline} why={i.why} />
        ))}
      </Section>

      {executive.bottlenecks[0] ? (
        <Section title={t('coach.execBottleneck')}>
          <Line
            title={executive.bottlenecks[0].title}
            why={`${executive.bottlenecks[0].why} → ${executive.bottlenecks[0].unlock}`}
          />
        </Section>
      ) : null}

      {executive.roiRecommendations[0] ? (
        <Section title={t('coach.execRoi')}>
          <Line
            title={executive.roiRecommendations[0].action}
            why={`${executive.roiRecommendations[0].why} · ${executive.roiRecommendations[0].expectedLift}`}
          />
        </Section>
      ) : null}

      {executive.leadershipDna[0] ? (
        <Section title={t('coach.execDna')}>
          <Line
            title={executive.leadershipDna[0].trait}
            why={`${executive.leadershipDna[0].evidence} — ${executive.leadershipDna[0].why}`}
          />
        </Section>
      ) : null}

      {executive.forecast[0] ? (
        <Section title={t('coach.execForecast')}>
          <Line title={executive.forecast[0].title} why={executive.forecast[0].why} />
        </Section>
      ) : null}

      {executive.timeline.length > 0 ? (
        <Section title={t('coach.execTimeline')}>
          {executive.timeline.slice(0, 3).map((item) => (
            <Line key={item.id} title={item.title} why={item.why} />
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
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-line bg-surface px-2 py-1.5">
      <p className="font-semibold text-ink">
        {label} · {score}
      </p>
      <p className="text-[11px] text-muted">{status}</p>
      {why ? (
        <p className="mt-0.5 text-[11px] text-muted">{t('coach.whyPrefix', { reason: why })}</p>
      ) : null}
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
  const { t } = useI18n();
  return (
    <div>
      <p className="text-sm font-medium leading-snug text-ink">{title}</p>
      <p className="text-xs text-muted">{t('coach.whyPrefix', { reason: why })}</p>
    </div>
  );
}
