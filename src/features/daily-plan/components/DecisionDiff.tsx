import { useI18n } from '@shared/i18n';
import type { DecisionDiffChange, DecisionDiffResult } from '../dayMemory/buildDecisionDiff';
import './decisionDiff.css';

/**
 * Sprint 5 · Decision Diff — morning change reader.
 * One card. WHAT + WHY + So what? Ends with one question for PR #35.
 */
export function DecisionDiff({
  result,
  firstName,
}: {
  result: DecisionDiffResult;
  firstName?: string | null;
}) {
  const { t } = useI18n();
  const { changes, mode, suggestedFocus } = result;
  if (changes.length === 0) return null;

  const greeting = firstName
    ? hour < 11
      ? t('today.diffGreetingMorningNamed', { name: firstName })
      : t('today.diffGreetingDayNamed', { name: firstName })
    : hour < 11
      ? t('today.diffGreetingMorning')
      : t('today.diffGreetingDay');

  return (
    <section className="decision-diff" aria-label={t('today.diffAria')}>
      <header className="decision-diff__head">
        <p className="decision-diff__eyebrow">{t('today.diffEyebrow')}</p>
        <h2 className="decision-diff__greeting">{greeting}</h2>
        <p className="decision-diff__title">
          {mode === 'stable'
            ? t('today.diffStableTitle')
            : mode === 'no_close'
              ? t('today.diffNoCloseTitle')
              : t('today.diffSinceYesterday')}
        </p>
      </header>

      <ul className="decision-diff__list">
        {changes.map((line) => (
          <li key={line.id} className="decision-diff__row" data-kind={line.kind}>
            <p className="decision-diff__line-title">{changeWhat(line, t)}</p>
            <p className="decision-diff__why">{changeWhy(line, t)}</p>
            <p className="decision-diff__so-what">
              <span className="decision-diff__so-label">{t('today.diffSoWhat')}</span>{' '}
              {soWhatLabel(line.soWhat, t)}
            </p>
          </li>
        ))}
      </ul>

      <footer className="decision-diff__footer">
        <p className="decision-diff__question">{t('today.diffClosingQuestion')}</p>
        {suggestedFocus ? (
          <p className="decision-diff__focus-hint">
            {t('today.diffSuggestedFocus', { focus: suggestedFocus })}
          </p>
        ) : (
          <p className="decision-diff__focus-hint">{t('today.diffSuggestedFocusNone')}</p>
        )}
      </footer>
    </section>
  );
}

function changeWhat(line: DecisionDiffChange, t: ReturnType<typeof useI18n>['t']): string {
  switch (line.kind) {
    case 'priority_done':
      return t('today.diffWhatPriorityDone', { name: line.subject });
    case 'priority_open':
      return t('today.diffWhatPriorityOpen', { name: line.subject });
    case 'carry_over':
      return t('today.diffWhatCarry', { name: line.subject });
    case 'contact_colder':
      return t('today.diffWhatColder', { name: line.subject });
    case 'contact_hot':
      return t('today.diffWhatHot', { name: line.subject });
    case 'follow_up_overdue':
      return t('today.diffWhatOverdue', { name: line.subject });
    case 'partner_signal':
      return t('today.diffWhatPartner', { name: line.subject });
    case 'team_warning':
      return t('today.diffWhatTeam', { name: line.subject });
    case 'opportunity':
      return t('today.diffWhatOpportunity', { name: line.subject });
    case 'stable':
      return line.why === 'no_close' ? t('today.diffCleanNoClose') : t('today.diffStableBody');
  }
}

function changeWhy(line: DecisionDiffChange, t: ReturnType<typeof useI18n>['t']): string {
  if (line.kind === 'stable') {
    return line.why === 'no_close' ? t('today.diffCleanHint') : t('today.diffStableWhy');
  }
  if (line.why === 'priority_completed') return t('today.diffWhyPriorityDone');
  if (line.why === 'priority_missed') return t('today.diffWhyMissed');
  if (line.why === 'priority_partial') return t('today.diffWhyPartial');
  if (line.why === 'still_on_plan') return t('today.diffWhyStillOnPlan');
  if (line.why === 'seeded_yesterday') return t('today.diffWhySeeded');
  if (line.why === 'plan_urgent') return t('today.diffWhyPlanUrgent');
  // Evidence string from coach/warnings/follow-ups — show as WHY
  return line.why;
}

function soWhatLabel(
  soWhat: DecisionDiffChange['soWhat'],
  t: ReturnType<typeof useI18n>['t']
): string {
  switch (soWhat) {
    case 'follow_today':
      return t('today.diffActFollow');
    case 'wait':
      return t('today.diffActWait');
    case 'observe':
      return t('today.diffActObserve');
    case 'celebrate':
      return t('today.diffActCelebrate');
    case 'prepare':
      return t('today.diffActPrepare');
  }
}
