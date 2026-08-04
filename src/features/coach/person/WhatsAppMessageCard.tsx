import { useState } from 'react';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import './person-coach-conversation.css';

interface Props {
  text: string;
  onEdit: (text: string) => void;
}

export function WhatsAppMessageCard({ text, onEdit }: Props) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  return (
    <div className="wa-card" role="group" aria-label={t('coach.waCardTitle')}>
      <div className="wa-card__head">
        <span className="wa-card__badge" aria-hidden>
          ✉
        </span>
        <p className="wa-card__title">{t('coach.waCardTitle')}</p>
      </div>
      <p className="wa-card__body">{text}</p>
      <div className="wa-card__actions">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          fullWidth={false}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            } catch {
              // ignore
            }
          }}
        >
          {copied ? t('common.copied') : t('common.copy')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          fullWidth={false}
          onClick={() => onEdit(text)}
        >
          {t('common.edit')}
        </Button>
        <Button type="button" size="sm" fullWidth={false} onClick={() => onEdit(text)}>
          {t('coach.waSendToEditor')}
        </Button>
      </div>
    </div>
  );
}
