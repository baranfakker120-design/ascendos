import type { MessageKey } from '@shared/i18n';
import { useCoachDisplayName } from '@shared/org/useCoachDisplayName';
import type { ConversationKind } from './workspace/types';
import { kindHintKey, welcomeIdentityLine, welcomeNextStepBody } from './CoachWelcomeContent';
import './coach-welcome.css';

type TFn = (key: MessageKey, params?: Record<string, string | number>) => string;

type Props = {
  kind: ConversationKind;
  welcome: string;
  t: TFn;
};

/**
 * Calm first-screen welcome — short identity + one next-step card.
 * Presentation only; reuses existing welcome / kindHint / readingNext strings.
 */
export function CoachWelcomePanel({ kind, welcome, t }: Props) {
  const identity = welcomeIdentityLine(welcome);
  const nextBody = welcomeNextStepBody(welcome);
  const hint = t(kindHintKey(kind));
  const coachName = useCoachDisplayName();

  return (
    <section className={`coach-welcome coach-welcome--${kind}`} aria-label={coachName}>
      <div className="coach-welcome__intro">
        <p className="coach-welcome__identity">{identity}</p>
        <p className="coach-welcome__hint">{hint}</p>
      </div>
      <aside className="coach-welcome__next" aria-label={t('coach.readingNext')}>
        <p className="coach-welcome__next-label">{t('coach.readingNext')}</p>
        <p className="coach-welcome__next-body">{nextBody}</p>
      </aside>
    </section>
  );
}
