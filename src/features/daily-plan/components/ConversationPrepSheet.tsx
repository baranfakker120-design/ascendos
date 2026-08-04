import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { Button } from '@shared/ui/Button';
import { BottomSheet } from '@shared/ui/BottomSheet';
import { useContact, useContactEvents } from '@features/contacts/contactsApi';
import { useCoachOrgIntelligence } from '@features/coach/intelligence';
import { writePendingSeed } from '@features/coach/workspace/personContext';
import {
  buildConversationPrep,
  type ConversationPrepPack,
} from '../dayMemory/buildConversationPrep';
import './conversationPrep.css';

/**
 * Sprint 5 · L5 — ≤8s prep at the moment of outreach. Human sends.
 */
export function ConversationPrepSheet({
  open,
  contactId,
  missionTitle,
  missionReason,
  onClose,
}: {
  open: boolean;
  contactId: string | null;
  missionTitle: string | null;
  missionReason: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const id = contactId ?? '';
  const contact = useContact(id);
  const events = useContactEvents(id);
  const { intelligence } = useCoachOrgIntelligence(open && Boolean(contactId));
  const [copied, setCopied] = useState(false);

  const pack: ConversationPrepPack | null = useMemo(() => {
    if (!open || !contactId || !contact.data) return null;
    const followUp = intelligence?.followUps.find((f) => f.contactId === contactId) ?? null;
    return buildConversationPrep({
      contactId,
      contactName: contact.data.name,
      phase: contact.data.phase,
      nextStep: contact.data.next_step,
      missionTitle,
      missionReason: missionReason ?? followUp?.why ?? null,
      events: (events.data ?? []).slice(0, 3).map((e) => ({
        id: e.id,
        label: e.event_type,
        at: e.occurred_at ?? e.created_at ?? null,
      })),
      insight: followUp
        ? {
            nextBestAction: contact.data.next_step || String(followUp.nextAction),
            nextBestActionWhy: followUp.why,
            possibleObjection: null,
            suggestedWhatsApp: '',
            currentSituation: `${followUp.heat} · ${followUp.why}`,
            riskScore: followUp.heat === 'lost' || followUp.heat === 'forgotten' ? 70 : 40,
          }
        : null,
    });
  }, [open, contactId, contact.data, events.data, intelligence, missionTitle, missionReason]);

  return (
    <BottomSheet open={open && Boolean(contactId)} title={t('today.prepTitle')} onClose={onClose}>
      {!pack ? (
        <p className="text-sm text-muted">{t('today.prepLoading')}</p>
      ) : (
        <div className="conv-prep space-y-4">
          <header>
            <p className="conv-prep__eyebrow">{t('today.prepEyebrow')}</p>
            <h3 className="text-lg font-bold tracking-tight">{pack.contactName}</h3>
            {pack.phase ? (
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {pack.phase}
              </p>
            ) : null}
          </header>

          <section>
            <p className="conv-prep__label">{t('today.prepSituation')}</p>
            <p className="text-sm">{pack.situation}</p>
          </section>

          <section>
            <p className="conv-prep__label">{t('today.prepNext')}</p>
            <p className="text-sm font-semibold">{pack.nextQuestion}</p>
            <p className="mt-1 text-xs text-muted">{pack.nextWhy}</p>
          </section>

          {pack.objection ? (
            <section>
              <p className="conv-prep__label">{t('today.prepObjection')}</p>
              <p className="text-sm">{pack.objection}</p>
            </section>
          ) : null}

          {pack.recentEvents.length > 0 ? (
            <section>
              <p className="conv-prep__label">{t('today.prepEvents')}</p>
              <ul className="mt-1 space-y-1">
                {pack.recentEvents.map((e) => (
                  <li key={e.id} className="text-sm text-muted">
                    · {e.label}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="conv-prep__draft">
            <p className="conv-prep__label">{t('today.prepDraft')}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{pack.draft}</p>
            <p className="mt-2 text-xs font-medium text-accent-deep">{t('today.prepCompliance')}</p>
          </section>

          <div className="space-y-2">
            <Button
              onClick={() => {
                void navigator.clipboard?.writeText(pack.draft).then(
                  () => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  },
                  () => undefined
                );
              }}
            >
              {copied ? t('today.prepCopied') : t('today.prepCopy')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                writePendingSeed(
                  [
                    `Prepare conversation with ${pack.contactName}.`,
                    `Situation: ${pack.situation}`,
                    `Next: ${pack.nextQuestion}`,
                    `Draft:\n${pack.draft}`,
                  ].join('\n')
                );
                window.location.assign(`/coach?kontakt=${pack.contactId}`);
              }}
            >
              {t('today.prepAskAscent')}
            </Button>
            <Link
              to={`/kontakte/${pack.contactId}`}
              className="block text-center text-sm font-medium text-primary"
              onClick={onClose}
            >
              {t('today.prepOpenContact')}
            </Link>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
