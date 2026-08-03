import { Link, useNavigate, useParams } from 'react-router-dom';
import { scoreLeadPhase } from '@shared/lib/apScoring';
import { activityLabel, daysSince } from '@shared/lib/pipeline';
import type { ExternalTool, PipelineEventType } from '@shared/types/domain';
import { ApRewardSticker } from '@shared/ui/ApRewardSticker';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { EventPicker } from './components/EventPicker';
import { EventTimeline } from './components/EventTimeline';
import { PhaseBadge } from './components/PhaseBadge';
import { ShareTools } from './components/ShareTools';
import {
  useContact,
  useContactEvents,
  useContactMutations,
  useExternalTools,
} from './contactsApi';

export function ContactDetailPage() {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const { data: contact, isLoading } = useContact(contactId!);
  const { data: events } = useContactEvents(contactId!);
  const { data: tools } = useExternalTools();
  const { addEvent, deleteContact, correctEvent } = useContactMutations();

  if (isLoading) return <p className="text-sm text-muted">Kontakt wird geladen …</p>;
  if (!contact) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Dieser Kontakt existiert nicht (mehr).</p>
        <Link to="/kontakte" className="text-sm font-medium text-primary">
          Zurück zu den Kontakten
        </Link>
      </div>
    );
  }

  const days = daysSince(contact.last_event_at);
  const overdue = days !== null && days >= 7 && contact.phase !== 'partner';

  const logEvent = (eventType: PipelineEventType, source = 'manual') => {
    void addEvent.mutateAsync({ contactId: contact.id, eventType, source });
  };

  const onToolShared = (tool: ExternalTool) => {
    logEvent(tool.share_event_type, tool.key);
  };

  const remove = async () => {
    const ok = window.confirm(
      `„${contact.name}" wirklich löschen? Die komplette Historie geht dabei verloren.`
    );
    if (!ok) return;
    await deleteContact.mutateAsync(contact.id);
    navigate('/kontakte', { replace: true });
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
            <PhaseBadge phase={contact.phase} />
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
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Nächster Schritt
          </p>
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
        <Link
          to={`/coach?kontakt=${contact.id}`}
          className="flex w-full items-center justify-between rounded-xl border border-primary/40 bg-surface px-4 py-3 transition-colors hover:bg-bg"
        >
          <span>
            <span className="block text-sm font-medium">Ascent zu {contact.name.split(' ')[0]} fragen</span>
            <span className="block text-xs text-muted">
              Kennt Phase, Verlauf und nächsten Schritt bereits
            </span>
          </span>
          <span className="text-xs font-medium text-primary">→</span>
        </Link>
        <ShareTools tools={tools ?? []} contactName={contact.name} onShared={onToolShared} />
        <EventPicker onSelect={(type) => logEvent(type)} busy={addEvent.isPending} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Verlauf</h2>
        <EventTimeline
          events={events ?? []}
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
        <Link to={`/kontakte/${contact.id}/bearbeiten`}>
          <Button variant="secondary">Kontakt bearbeiten</Button>
        </Link>
        <Button variant="ghost" onClick={() => void remove()} className="text-red-600">
          Kontakt löschen
        </Button>
      </section>
    </div>
  );
}
