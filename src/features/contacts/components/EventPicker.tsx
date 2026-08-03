import { useState } from 'react';
import { scorePipelineEvent } from '@shared/lib/apScoring';
import { MANUAL_EVENT_TYPES, eventLabel } from '@shared/lib/pipeline';
import type { PipelineEventType } from '@shared/types/domain';
import { Alert } from '@shared/ui/Alert';
import { ApRewardSticker } from '@shared/ui/ApRewardSticker';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';

/** Manuelles Setzen eines Pipeline-Events inkl. Reward-Preview. */
export function EventPicker({
  onSelect,
  busy,
}: {
  onSelect: (type: PipelineEventType) => void | Promise<void>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + Ereignis dokumentieren
      </Button>
    );
  }

  const locked = busy || saving;

  return (
    <Card padding="sm" className="space-y-2">
      <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted">
        Was ist passiert?
      </p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="grid grid-cols-1 gap-1.5">
        {MANUAL_EVENT_TYPES.map((type) => (
          <Button
            key={type}
            variant="secondary"
            disabled={locked}
            aria-busy={saving}
            onClick={() => {
              setError(null);
              setSaving(true);
              void Promise.resolve(onSelect(type))
                .then(() => setOpen(false))
                .catch(() => setError('Ereignis konnte nicht gespeichert werden.'))
                .finally(() => setSaving(false));
            }}
            className="h-auto min-h-10 justify-between py-2.5 text-left [&_.ui-btn__label]:w-full [&_.ui-btn__label]:justify-between"
          >
            <span>{eventLabel(type)}</span>
            <ApRewardSticker ap={scorePipelineEvent(type)} size="sm" animate={false} />
          </Button>
        ))}
      </div>
      <Button variant="ghost" disabled={locked} onClick={() => setOpen(false)}>
        Abbrechen
      </Button>
    </Card>
  );
}
