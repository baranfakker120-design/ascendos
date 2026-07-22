import { useState } from 'react';
import { MANUAL_EVENT_TYPES, eventLabel } from '@shared/lib/pipeline';
import type { PipelineEventType } from '@shared/types/domain';
import { Button } from '@shared/ui/Button';

/** Manuelles Setzen eines Pipeline-Events (die Checkboxen aus Phase 2). */
export function EventPicker({
  onSelect,
  busy,
}: {
  onSelect: (type: PipelineEventType) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + Ereignis dokumentieren
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface p-3">
      <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted">
        Was ist passiert?
      </p>
      <div className="grid grid-cols-1 gap-1.5">
        {MANUAL_EVENT_TYPES.map((type) => (
          <button
            key={type}
            disabled={busy}
            onClick={() => {
              onSelect(type);
              setOpen(false);
            }}
            className="rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-bg disabled:opacity-50"
          >
            {eventLabel(type)}
          </button>
        ))}
      </div>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Abbrechen
      </Button>
    </div>
  );
}
