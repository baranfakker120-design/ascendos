import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Input } from '@shared/ui/Input';
import { TextArea } from '@shared/ui/TextArea';
import { useContact, useContactMutations } from './contactsApi';

/** Ein Formular für beide Fälle: /kontakte/neu und /kontakte/:id/bearbeiten */
export function ContactFormPage() {
  const { contactId } = useParams();
  const isEdit = !!contactId;
  const navigate = useNavigate();
  const { data: existing } = useContact(contactId ?? '');
  const { createContact, updateContact } = useContactMutations();

  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [nextStep, setNextStep] = useState(existing?.next_step ?? '');
  const [nextStepDue, setNextStepDue] = useState(existing?.next_step_due ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  // Bearbeiten: sobald der Kontakt geladen ist, Felder einmalig befüllen.
  const [hydrated, setHydrated] = useState(false);
  if (isEdit && existing && !hydrated) {
    setName(existing.name);
    setPhone(existing.phone ?? '');
    setEmail(existing.email ?? '');
    setNextStep(existing.next_step ?? '');
    setNextStepDue(existing.next_step_due ?? '');
    setNotes(existing.notes ?? '');
    setHydrated(true);
  }

  const busy = createContact.isPending || updateContact.isPending;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const input = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      next_step: nextStep.trim() || null,
      next_step_due: nextStepDue || null,
      notes: notes.trim() || null,
    };
    try {
      if (isEdit) {
        await updateContact.mutateAsync({ id: contactId, ...input });
        navigate(`/kontakte/${contactId}`);
      } else {
        const created = await createContact.mutateAsync(input);
        navigate(`/kontakte/${created.id}`, { replace: true });
      }
    } catch {
      setError('Speichern fehlgeschlagen. Bitte versuche es erneut.');
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{isEdit ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}</h1>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input
          label="Telefon (optional)"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="off"
        />
        <Input
          label="E-Mail (optional)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
        />
        <Input
          label="Nächster Schritt (optional)"
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          placeholder="z. B. Nach der Präsentation anrufen"
        />
        <Input
          label="Fällig am (optional)"
          type="date"
          value={nextStepDue}
          onChange={(e) => setNextStepDue(e.target.value)}
          hint="Terminierte Schritte erscheinen am Fälligkeitstag als Top-Mission in deinem Tagesplan."
        />
        <TextArea
          label="Notizen (optional)"
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Kontext fürs nächste Gespräch"
          hint="Bitte nur geschäftlich Relevantes notieren — keine sensiblen persönlichen Angaben."
        />
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? 'Wird gespeichert …' : isEdit ? 'Änderungen speichern' : 'Kontakt anlegen'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
          Abbrechen
        </Button>
      </form>
    </div>
  );
}
