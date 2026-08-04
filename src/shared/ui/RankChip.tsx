import { resolveFrameSrc } from '@shared/lib/frameAssets';

export type RankChipSize = 'sm' | 'md';
export type RankChipVariant = 'plain' | 'framed';

export interface RankChipProps {
  /** Anzeigename des Rangs (z. B. „Newcomer"). */
  label: string;
  /** Optionaler Rang-Schlüssel zur Anzeige (z. B. newcomer). */
  rankKey?: string;
  /** Optionaler Rahmen-Schlüssel für Mini-Frame (framed). */
  frameKey?: string | null;
  size?: RankChipSize;
  variant?: RankChipVariant;
  /** Ausgewählt (Filter / aktive Zeile). */
  selected?: boolean;
  /** Gesperrt / nicht freigeschaltet. */
  locked?: boolean;
  className?: string;
}

/**
 * Kompakte Rang-Identität ohne vollen RankFrame.
 * Nur Präsentation — keine Features, kein Supabase.
 */
export function RankChip({
  label,
  rankKey,
  frameKey = null,
  size = 'md',
  variant = 'plain',
  selected = false,
  locked = false,
  className = '',
}: RankChipProps) {
  const showFrame = variant === 'framed' && !!frameKey && !locked;
  const frameSrc = showFrame ? resolveFrameSrc(frameKey, 'sm') : null;
  const height = size === 'sm' ? 'h-7' : 'h-8';
  const pad = size === 'sm' ? 'px-2' : 'px-2.5';

  const tone = locked
    ? 'border-line bg-bg text-muted'
    : selected
      ? 'border-accent/40 bg-surface text-accent-deep'
      : 'border-line bg-surface text-ink';

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border ${height} ${pad} text-xs font-medium ${tone} ${className}`}
    >
      {frameSrc ? (
        <img
          src={frameSrc}
          alt=""
          aria-hidden
          className="h-4 w-4 shrink-0 object-contain"
          draggable={false}
        />
      ) : null}
      <span className="truncate">{label}</span>
      {rankKey && !locked ? (
        <span className="truncate text-[10px] font-normal text-muted">{rankKey}</span>
      ) : null}
    </span>
  );
}
