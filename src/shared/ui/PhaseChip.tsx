import { phaseLabel } from '@shared/lib/pipeline';
import type { ContactPhase } from '@shared/types/domain';
import './phase-chip.css';

const TONE: Record<ContactPhase, string> = {
  lead: 'phase-chip--lead',
  im_gespraech: 'phase-chip--talk',
  praesentation_offen: 'phase-chip--warm',
  praesentation: 'phase-chip--warm',
  fit_check: 'phase-chip--violet',
  three_way_call: 'phase-chip--violet',
  kunde: 'phase-chip--success',
  partner: 'phase-chip--partner',
};

/**
 * Premium pipeline phase identity — replaces legacy PhaseBadge.
 * Same material language as RoleBadge (glass, spring presence).
 */
export function PhaseChip({ phase, className = '' }: { phase: ContactPhase; className?: string }) {
  return (
    <span className={`phase-chip ${TONE[phase]} ${className}`}>
      <span className="phase-chip__sheen" aria-hidden />
      <span className="phase-chip__label">{phaseLabel(phase)}</span>
    </span>
  );
}
