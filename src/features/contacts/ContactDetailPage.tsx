import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { scoreLeadPhase } from '@shared/lib/apScoring';
import { activityLabel, daysSince } from '@shared/lib/pipeline';
import { listPendingShareVerifications } from '@shared/lib/shareVerification';
import type { ExternalTool, PipelineEventType } from '@shared/types/domain';
import { Alert } from '@shared/ui/Alert';
import { ApRewardSticker } from '@shared/ui/ApRewardSticker';
import { Button } from '@shared/ui/Button';
import { ButtonLink } from '@shared/ui/ButtonLink';
import { Card } from '@shared/ui/Card';
import { PhaseChip } from '@shared/ui/PhaseChip';
import { EventPicker } from './components/EventPicker';
import { EventTimeline } from './components/EventTimeline';
import { ShareTools } from './components/ShareTools';
import { useContact, useContactEvents, useContactMutations, useExternalTools } from './contactsApi';

export function ContactDetailPage() {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const { data: contact, isPending, isError, isSuccess } = useContact(contactId!);
  const { data: events } = useContactEvents(contactId!);
  const { data: tools } = useExternalTools();
  const { addEvent, deleteContact, correctEvent } = useContactMutations();
  const [actionError, setActionError] = useState<string | null>(null);
  const [proofTick, setProofTick] = useState(0);

  const pendingProofs = useMemo(() => {
    void proofTick;
    return listPendingShareVerifications(contactId);
  }, [contactId, proofTick]);

  const pendingToolKeys = useMemo(
    () => new Set(pendingProofs.map((p) => p.toolKey)),
    [pendingProofs]
  );

  if (isPending) return <p className="text-sm text-muted">Kontakt wird geladen …</p>;
  if (isError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Kontakt konnte nicht geladen werden.</p>
        <Link to="/kontakte" className="text-sm font-medium text-primary">
          Zurück zu den Kontakten
        </Link>
      </div>
    );
  }
  if (isSuccess && !contact) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Dieser Kontakt existiert nicht (mehr).</p>
        <Link to="/kontakte" className="text-sm font-medium text-primary">
          Zurück zu den Kontakten
        </Link>
      </div>
    );
  }
  if (!contact) return null;

  const days = daysSince(contact.last_event_at);
  const overdue = days !== null && days >= 7 && contact.phase !== 'partner';

  const logEvent = async (eventType: PipelineEventType, source = 'manual') => {
    setActionError(null);
    try {
      await addEvent.mutateAsync({ contactId: contact.id, eventType, source });
    } catch {
      setActionError('Ereignis konnte nicht gespeichert werden.');
      throw new Error('event-failed');
    }
  };

  const onToolShared = (tool: ExternalTool) => {
    void logEvent(tool.share_event_type, tool.key)
      .then(() => setProofTick((t) => t + 1))
      .catch(() => undefined);
  };

  const remove = async () => {
    const ok = window.confirm(
      `„${contact.name}" wirklich löschen? Die komplette Historie geht dabei verloren.`
    );
    if (!ok) return;
    setActionError(null);
    try {
      await deleteContact.mutateAsync(contact.id);
      navigate('/kontakte', { replace: true });
    } catch {
      setActionError('Löschen fehlgeschlagen. Bitte erneut versuchen.');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <Link to="/kontakte" className="text-sm text-muted">
          ← Kontakte
        </Link>
        <div className="mt-2 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">{contact.name}</h1>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <PhaseChip phase={contact.phase} />
            <ApRewardSticker ap={scoreLeadPhase(contact.phase)} size="sm" />
          </div>
        </div>
        <p className={`mt-1 text-sm ${overdue ? 'font-medium text-red-600' : 'text-muted'}`}>
          {activityLabel(contact.last_event_at)}
          {overdue ? ' · Follow-up überfällig' : ''}
        </p>
      </div>

      {contact.next_step ? (
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Nächster Schritt</p>
          <p className="mt-1 font-medium">{contact.next_step}</p>
        </Card>
      ) : null}

      {(contact.phone || contact.email || contact.notes) && (
        <Card className="space-y-2 text-sm">
          {contact.phone ? (
            <a href={`tel:${contact.phone}`} className="block font-medium text-primary">
              📞 {contact.phone}
            </a>
          ) : null}
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className="block font-medium text-primary">
              ✉️ {contact.email}
            </a>
          ) : null}
          {contact.notes ? <p className="whitespace-pre-wrap text-muted">{contact.notes}</p> : null}
        </Card>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Aktionen</h2>
        {actionError ? <Alert tone="error">{actionError}</Alert> : null}
        <ButtonLink
          to={`/coach?kontakt=${contact.id}`}
          variant="secondary"
          className="h-auto min-h-12 justify-between py-3 text-left [&_.ui-btn__label]:w-full [&_.ui-btn__label]:justify-between"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              Ascent zu {contact.name.split(' ')[0]} fragen
            </span>
            <span className="block text-xs font-normal text-muted">
              Kennt Phase, Verlauf und nächsten Schritt bereits
            </span>
          </span>
          <span className="text-xs font-medium text-primary">→</span>
        </ButtonLink>
        <ShareTools
          tools={tools ?? []}
          contactId={contact.id}
          contactName={contact.name}
          onShared={onToolShared}
          onProofChange={() => setProofTick((t) => t + 1)}
          pendingToolKeys={pendingToolKeys}
        />
        <EventPicker onSelect={(type) => logEvent(type)} busy={addEvent.isPending} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Verlauf</h2>
        <EventTimeline
          events={events ?? []}
          pendingProofs={pendingProofs}
          correcting={correctEvent.isPending}
          onCorrect={(eventId) => {
            const ok = window.confirm(
              'Dieses Ereignis als Fehl-Eingabe markieren? Es bleibt sichtbar, zählt aber nicht mehr für die Phase.'
            );
            if (ok) void correctEvent.mutateAsync(eventId);
          }}
        />
      </section>

      <section className="space-y-2 border-t border-line pt-4">
        <ButtonLink to={`/kontakte/${contact.id}/bearbeiten`} variant="secondary">
          Kontakt bearbeiten
        </ButtonLink>
        <Button variant="danger" onClick={() => void remove()}>
          Kontakt löschen
        </Button>
      </section>
    </div>
  );
}
