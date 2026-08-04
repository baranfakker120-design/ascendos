import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { DRAFT_SCOPES, usePersistedDraft } from '@shared/offline';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Input } from '@shared/ui/Input';
import { TextArea } from '@shared/ui/TextArea';
import { useContact, useContactMutations } from './contactsApi';
import type { Contact } from '@shared/types/domain';

/** Ein Formular für beide Fälle: /kontakte/neu und /kontakte/:id/bearbeiten */
export function ContactFormPage() {
  const { t } = useI18n();
  const { contactId } = useParams();
  const isEdit = !!contactId;
  const { data: existing, isPending, isError } = useContact(contactId ?? '');

  if (isEdit && isPending) {
    return <p className="text-sm text-muted">{t('contacts.loading')}</p>;
  }

  if (isEdit && (isError || !existing)) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">
          {isError ? t('contacts.loadFailed') : t('contacts.gone')}
        </p>
        <Link to="/kontakte" className="text-sm font-medium text-primary">
          {t('contacts.backToList')}
        </Link>
      </div>
    );
  }

  // Remount when the loaded contact identity changes so local state
  // initializes from server data once — no setState-during-render hydrate.
  return (
    <ContactForm
      key={existing?.id ?? 'new'}
      isEdit={isEdit}
      contactId={contactId}
      existing={existing ?? null}
    />
  );
}

function ContactForm({
  isEdit,
  contactId,
  existing,
}: {
  isEdit: boolean;
  contactId?: string;
  existing: Contact | null;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { createContact, updateContact } = useContactMutations();

  const {
    value: { name, phone, email, nextStep, nextStepDue, notes },
    patch,
    clear: clearContactDraft,
  } = usePersistedDraft(isEdit ? DRAFT_SCOPES.contactEdit(contactId!) : DRAFT_SCOPES.contactNew, {
    name: existing?.name ?? '',
    phone: existing?.phone ?? '',
    email: existing?.email ?? '',
    nextStep: existing?.next_step ?? '',
    nextStepDue: existing?.next_step_due ?? '',
    notes: existing?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);

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
        const status = await updateContact.mutateAsync({ id: contactId!, ...input });
        if (status === 'synced') await clearContactDraft();
        navigate(`/kontakte/${contactId}`);
      } else {
        const created = await createContact.mutateAsync(input);
        if (created.id.startsWith('local-')) {
          navigate('/kontakte', { replace: true });
        } else {
          await clearContactDraft();
          navigate(`/kontakte/${created.id}`, { replace: true });
        }
      }
    } catch {
      setError(t('contacts.saveFailed'));
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        {isEdit ? t('contacts.editTitle') : t('contacts.newTitle')}
      </h1>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label={t('contacts.name')}
          value={name}
          onChange={(e) => patch({ name: e.target.value })}
          required
        />
        <Input
          label={t('contacts.phoneOptional')}
          type="tel"
          value={phone}
          onChange={(e) => patch({ phone: e.target.value })}
          autoComplete="off"
        />
        <Input
          label={t('contacts.emailOptional')}
          type="email"
          value={email}
          onChange={(e) => patch({ email: e.target.value })}
          autoComplete="off"
        />
        <Input
          label={t('contacts.nextStepOptional')}
          value={nextStep}
          onChange={(e) => patch({ nextStep: e.target.value })}
          placeholder={t('contacts.nextStepPlaceholder')}
        />
        <Input
          label={t('contacts.dueOptional')}
          type="date"
          value={nextStepDue}
          onChange={(e) => patch({ nextStepDue: e.target.value })}
          hint={t('contacts.dueHint')}
        />
        <TextArea
          label={t('contacts.notesOptional')}
          id="notes"
          value={notes}
          onChange={(e) => patch({ notes: e.target.value })}
          rows={3}
          placeholder={t('contacts.notesPlaceholder')}
          hint={t('contacts.notesHint')}
        />
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? t('common.saving') : isEdit ? t('contacts.saveChanges') : t('contacts.create')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
          {t('common.cancel')}
        </Button>
      </form>
    </div>
  );
}
