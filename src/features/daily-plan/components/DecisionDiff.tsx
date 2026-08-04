import { useI18n } from '@shared/i18n';
import type { DecisionDiffLine } from '../dayMemory/buildDecisionDiff';
import './decisionDiff.css';

/**
 * Sprint 5 · L2 — morning truth delta. One job: what changed that matters.
 */
export function DecisionDiff({ lines }: { lines: DecisionDiffLine[] }) {
  const { t } = useI18n();
  if (lines.length === 0) return null;

  return (
    <section className="decision-diff" aria-label={t('today.diffAria')}>
      <header className="decision-diff__head">
        <p className="decision-diff__eyebrow">{t('today.diffEyebrow')}</p>
        <h2 className="decision-diff__title">{t('today.diffTitle')}</h2>
      </header>
      <ul className="decision-diff__list">
        {lines.map((line) => (
          <li key={line.id} className="decision-diff__row" data-kind={line.kind}>
            <span className="decision-diff__kind">{kindLabel(line.kind, t)}</span>
            <p className="decision-diff__line-title">{lineTitle(line, t)}</p>
            <p className="decision-diff__why">{lineWhy(line, t)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function kindLabel(kind: DecisionDiffLine['kind'], t: ReturnType<typeof useI18n>['t']): string {
  switch (kind) {
    case 'missed_priority':
      return t('today.diffKindMissed');
    case 'carry_over':
      return t('today.diffKindCarry');
    case 'team_signal':
      return t('today.diffKindTeam');
    case 'plan_delta':
      return t('today.diffKindDelta');
    case 'clean_start':
      return t('today.diffKindClean');
  }
}

function lineTitle(line: DecisionDiffLine, t: ReturnType<typeof useI18n>['t']): string {
  if (line.kind === 'clean_start') {
    return line.why === 'yesterday_clean'
      ? t('today.diffCleanYesterday')
      : t('today.diffCleanNoClose');
  }
  return line.title;
}

function lineWhy(line: DecisionDiffLine, t: ReturnType<typeof useI18n>['t']): string {
  if (line.kind === 'clean_start') return t('today.diffCleanHint');
  if (line.kind === 'missed_priority') {
    return line.why === 'priority_missed' ? t('today.diffWhyMissed') : t('today.diffWhyPartial');
  }
  if (line.kind === 'carry_over') {
    return line.why === 'still_on_plan' ? t('today.diffWhyStillOnPlan') : t('today.diffWhySeeded');
  }
  if (line.kind === 'team_signal') return line.why || t('today.diffWhyTeam');
  return line.why || t('today.diffWhyDelta');
}
