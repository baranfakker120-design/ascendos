import { useI18n, type MessageKey } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { CONVERSATION_KINDS, type ConversationKind } from './types';

const KIND_HINT: Record<ConversationKind, MessageKey> = {
  ceo: 'coach.ws.kindHint.ceo',
  person: 'coach.ws.kindHint.person',
  marketing: 'coach.ws.kindHint.marketing',
  recruiting: 'coach.ws.kindHint.recruiting',
  story: 'coach.ws.kindHint.story',
  leadership: 'coach.ws.kindHint.leadership',
  general: 'coach.ws.kindHint.general',
};

export function NewConversationSheet({
  open,
  onClose,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (kind: ConversationKind) => void;
}) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div className="coach-ws__new" role="presentation" onClick={onClose}>
      <div
        className="coach-ws__new-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('coach.ws.newTitle')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t('coach.ws.newEyebrow')}
            </p>
            <h2 className="mt-0.5 text-lg font-bold">{t('coach.ws.newTitle')}</h2>
            <p className="mt-1 text-sm text-muted">{t('coach.ws.newBody')}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            fullWidth={false}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            ✕
          </Button>
        </div>

        <div className="coach-ws__kinds">
          {CONVERSATION_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className="coach-ws__kind"
              onClick={() => onChoose(kind)}
            >
              <span>
                <strong>{t(`coach.ws.kind.${kind}` as MessageKey)}</strong>
                <span>{t(KIND_HINT[kind])}</span>
              </span>
              <span aria-hidden>+</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function defaultTitleForKind(
  kind: ConversationKind,
  t: (key: MessageKey) => string
): string {
  return t(`coach.ws.defaultTitle.${kind}` as MessageKey);
}
