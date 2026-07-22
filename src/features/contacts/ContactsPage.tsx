import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PHASE_ORDER, activityLabel, daysSince, phaseLabel } from '@shared/lib/pipeline';
import type { ContactPhase } from '@shared/types/domain';
import { Card } from '@shared/ui/Card';
import { CONTACTS_PAGE_SIZE, useContacts, type ContactWithPhase } from './contactsApi';
import { PhaseBadge } from './components/PhaseBadge';

/**
 * Pipeline-first statt Alphabet-first (Phase 3): Filter nach Phase,
 * pro Kontakt Phase, Aktivität und nächster Schritt auf einen Blick.
 * Überfällige Kontakte (7+ Tage ohne Aktivität, noch kein Partner)
 * werden markiert — die Regel-Engine von Sprint 3 baut hierauf auf.
 */
export function ContactsPage() {
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(CONTACTS_PAGE_SIZE);
  const { data, isLoading } = useContacts({ search, limit });
  const contacts = data?.items;
  const [filter, setFilter] = useState<ContactPhase | 'alle'>('alle');

  const filtered = useMemo(() => {
    if (!contacts) return [];
    if (filter === 'alle') return contacts;
    return contacts.filter((c) => c.phase === filter);
  }, [contacts, filter]);

  const countByPhase = useMemo(() => {
    const map = new Map<ContactPhase, number>();
    for (const c of contacts ?? []) map.set(c.phase, (map.get(c.phase) ?? 0) + 1);
    return map;
  }, [contacts]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kontakte</h1>
        <Link
          to="/kontakte/neu"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-ink"
        >
          + Neu
        </Link>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setLimit(CONTACTS_PAGE_SIZE);
        }}
        placeholder="Kontakt suchen …"
        className="h-11 w-full rounded-xl border border-line bg-surface px-4 text-base placeholder:text-muted focus:border-primary focus:outline-none"
      />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <FilterChip active={filter === 'alle'} onClick={() => setFilter('alle')}>
          Alle ({contacts?.length ?? 0})
        </FilterChip>
        {PHASE_ORDER.map((phase) => {
          const count = countByPhase.get(phase) ?? 0;
          if (count === 0) return null;
          return (
            <FilterChip key={phase} active={filter === phase} onClick={() => setFilter(phase)}>
              {phaseLabel(phase)} ({count})
            </FilterChip>
          );
        })}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Kontakte werden geladen …</p>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="font-medium">
            {search
              ? 'Keine Treffer'
              : filter === 'alle'
                ? 'Noch keine Kontakte'
                : 'Keine Kontakte in dieser Phase'}
          </p>
          <p className="mt-1 text-sm text-muted">
            {filter === 'alle'
              ? 'Lege deinen ersten Kontakt an — jede Pipeline beginnt mit einem Namen.'
              : 'Wähle einen anderen Filter oder lege einen neuen Kontakt an.'}
          </p>
        </Card>
      ) : (
        <>
          <ul className="space-y-2">
            {filtered.map((contact) => (
              <ContactRow key={contact.id} contact={contact} />
            ))}
          </ul>
          {data?.hasMore && filter === 'alle' ? (
            <button
              onClick={() => setLimit((l) => l + CONTACTS_PAGE_SIZE)}
              className="w-full rounded-xl border border-line bg-surface py-2.5 text-sm font-medium text-muted"
            >
              Weitere Kontakte laden
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-muted'
      }`}
    >
      {children}
    </button>
  );
}

function ContactRow({ contact }: { contact: ContactWithPhase }) {
  const days = daysSince(contact.last_event_at);
  const overdue = days !== null && days >= 7 && contact.phase !== 'partner';

  return (
    <li>
      <Link
        to={`/kontakte/${contact.id}`}
        className="block rounded-2xl border border-line bg-surface p-4 transition-colors hover:bg-bg"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{contact.name}</p>
            <p className={`mt-0.5 text-xs ${overdue ? 'font-medium text-red-600' : 'text-muted'}`}>
              {activityLabel(contact.last_event_at)}
              {overdue ? ' · Follow-up überfällig' : ''}
            </p>
            {contact.next_step ? (
              <p className="mt-1 truncate text-sm text-ink">→ {contact.next_step}</p>
            ) : null}
          </div>
          <PhaseBadge phase={contact.phase} />
        </div>
      </Link>
    </li>
  );
}
