import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { scoreLeadPhase } from '@shared/lib/apScoring';
import { PHASE_ORDER, activityLabel, daysSince, phaseLabel } from '@shared/lib/pipeline';
import type { ContactPhase } from '@shared/types/domain';
import { ApRewardSticker } from '@shared/ui/ApRewardSticker';
import { Button } from '@shared/ui/Button';
import { ButtonLink } from '@shared/ui/ButtonLink';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';
import { PhaseChip } from '@shared/ui/PhaseChip';
import { CONTACTS_PAGE_SIZE, useContacts, type ContactWithPhase } from './contactsApi';

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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Kontakte</h1>
        <ButtonLink to="/kontakte/neu" variant="primary" size="sm" fullWidth={false}>
          + Neu
        </ButtonLink>
      </div>

      <Input
        label="Kontakt suchen"
        hideLabel
        type="search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setLimit(CONTACTS_PAGE_SIZE);
        }}
        placeholder="Kontakt suchen …"
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
            <Button
              variant="secondary"
              onClick={() => setLimit((l) => l + CONTACTS_PAGE_SIZE)}
            >
              Weitere Kontakte laden
            </Button>
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
    <Button
      type="button"
      variant={active ? 'primary' : 'secondary'}
      size="chip"
      fullWidth={false}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function ContactRow({ contact }: { contact: ContactWithPhase }) {
  const days = daysSince(contact.last_event_at);
  const overdue = days !== null && days >= 7 && contact.phase !== 'partner';
  const rewardAp = scoreLeadPhase(contact.phase);

  return (
    <li>
      <Link to={`/kontakte/${contact.id}`} className="block">
        <Card padding="sm" interactive>
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
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <PhaseChip phase={contact.phase} />
              <ApRewardSticker ap={rewardAp} size="sm" animate={false} />
            </div>
          </div>
        </Card>
      </Link>
    </li>
  );
}
