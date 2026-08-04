import { useI18n, type MessageKey } from '@shared/i18n';
import { Button } from '@shared/ui/Button';

export type PersonQuickActionId =
  'message' | 'onboarding' | 'followup' | 'motivation' | 'analyse' | 'next';

const ACTIONS: Array<{
  id: PersonQuickActionId;
  icon: string;
  labelKey: MessageKey;
  promptKey: MessageKey;
}> = [
  {
    id: 'message',
    icon: '✉',
    labelKey: 'coach.personChip.message',
    promptKey: 'coach.personChip.messagePrompt',
  },
  {
    id: 'onboarding',
    icon: '📋',
    labelKey: 'coach.personChip.onboarding',
    promptKey: 'coach.personChip.onboardingPrompt',
  },
  {
    id: 'followup',
    icon: '📞',
    labelKey: 'coach.personChip.followup',
    promptKey: 'coach.personChip.followupPrompt',
  },
  {
    id: 'motivation',
    icon: '🚀',
    labelKey: 'coach.personChip.motivation',
    promptKey: 'coach.personChip.motivationPrompt',
  },
  {
    id: 'analyse',
    icon: '📈',
    labelKey: 'coach.personChip.analyse',
    promptKey: 'coach.personChip.analysePrompt',
  },
  {
    id: 'next',
    icon: '🧠',
    labelKey: 'coach.personChip.next',
    promptKey: 'coach.personChip.nextPrompt',
  },
];

interface Props {
  personName: string;
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function PersonQuickActions({ personName, onSend, disabled }: Props) {
  const { t } = useI18n();
  const first = personName.split(/\s+/)[0] || personName;

  return (
    <div className="person-coach__chips" role="list" aria-label={t('coach.personChip.aria')}>
      {ACTIONS.map((a) => (
        <Button
          key={a.id}
          type="button"
          variant="secondary"
          size="chip"
          fullWidth={false}
          disabled={disabled}
          role="listitem"
          onClick={() => onSend(t(a.promptKey, { name: first }))}
        >
          <span aria-hidden>{a.icon}</span> {t(a.labelKey)}
        </Button>
      ))}
    </div>
  );
}
