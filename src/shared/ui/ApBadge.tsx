export type ApBadgeSize = 'sm' | 'md' | 'lg';

/** Feste Außenmaße (Design Freeze Sprint 4.1) — kein Layout-Shift. */
export const AP_BADGE_SIZE_PX: Record<ApBadgeSize, number> = {
  sm: 40,
  md: 56,
  lg: 72,
};

function valueClass(size: ApBadgeSize): string {
  if (size === 'sm') return 'text-xs';
  if (size === 'md') return 'text-sm';
  return 'text-lg';
}

/** Anzeigezahl mit deutschem Tausenderpunkt. */
export function formatApBadgeValue(value: number): string {
  return Math.trunc(value).toLocaleString('de-DE');
}

/** Accessible Name — Zahl trägt die Bedeutung, nicht der Sticker. */
export function apBadgeAriaLabel(value: number): string {
  return `${formatApBadgeValue(value)} AP`;
}

export interface ApBadgeProps {
  /** AP-Betrag (Ganzzahl; Nachkommastellen werden abgeschnitten). */
  value: number;
  size?: ApBadgeSize;
  /** Optionales Sticker-Asset; ohne → Fallback-Platte. */
  stickerSrc?: string | null;
  className?: string;
}

/**
 * AP-Badge: lebende Zahl über optionalem Sticker.
 * Nur Präsentation — keine Features, kein Supabase.
 */
export function ApBadge({ value, size = 'md', stickerSrc = null, className = '' }: ApBadgeProps) {
  const px = AP_BADGE_SIZE_PX[size];
  const hasSticker = !!stickerSrc;
  const display = formatApBadgeValue(value);
  const label = apBadgeAriaLabel(value);

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: px, height: px }}
      role="img"
      aria-label={label}
    >
      {hasSticker ? (
        <img
          src={stickerSrc}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />
      ) : (
        <div
          className="absolute inset-0 rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(17_18_20_/_0.06)] ring-1 ring-accent/30"
          aria-hidden
        />
      )}

      <div className="relative z-[1] flex flex-col items-center justify-center leading-none">
        <span className={`font-bold tabular-nums text-ink ${valueClass(size)}`} aria-hidden>
          {display}
        </span>
        <span
          className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-deep"
          aria-hidden
        >
          AP
        </span>
      </div>
    </div>
  );
}
