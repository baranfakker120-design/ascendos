import { phaseLabel } from '@shared/lib/pipeline';
import type { ContactPhase } from '@shared/types/domain';

const TONES: Record<ContactPhase, string> = {
  lead: 'bg-bg text-muted border-line',
  im_gespraech: 'bg-blue-50 text-blue-700 border-blue-200',
  praesentation_offen: 'bg-amber-50 text-amber-700 border-amber-200',
  praesentation: 'bg-amber-50 text-amber-800 border-amber-300',
  fit_check: 'bg-violet-50 text-violet-700 border-violet-200',
  three_way_call: 'bg-violet-50 text-violet-800 border-violet-300',
  kunde: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partner: 'bg-emerald-600 text-white border-emerald-600',
};

export function PhaseBadge({ phase }: { phase: ContactPhase }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${TONES[phase]}`}
    >
      {phaseLabel(phase)}
    </span>
  );
}
