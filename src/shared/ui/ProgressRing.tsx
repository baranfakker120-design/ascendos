import type { ReactNode } from 'react';

/** Erlaubte Außenmaße (Design Freeze Sprint 4.1). */
export type ProgressRingSize = 40 | 56 | 72;

const STROKE_BY_SIZE: Record<ProgressRingSize, number> = {
  40: 3,
  56: 4,
  72: 4,
};

/** ratio auf [0, 1] klemmen — reine Präsentation. */
export function clampProgressRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  if (ratio <= 0) return 0;
  if (ratio >= 1) return 1;
  return ratio;
}

/** Prozent 0..100 für aria-valuenow. */
export function progressRatioToPercent(ratio: number): number {
  return Math.round(clampProgressRatio(ratio) * 100);
}

export interface ProgressRingProps {
  /** Fortschritt 0..1 (wird geklemmt). */
  ratio: number;
  size?: ProgressRingSize;
  /** Optionaler Inhalt in der Ringmitte. */
  children?: ReactNode;
  className?: string;
}

/**
 * Kompakter Kreis-Fortschritt für Listen und Zellen.
 * Nur Präsentation — keine Features, kein Supabase, keine Animation.
 */
export function ProgressRing({ ratio, size = 56, children, className = '' }: ProgressRingProps) {
  const clamped = clampProgressRatio(ratio);
  const percent = progressRatioToPercent(ratio);
  const stroke = STROKE_BY_SIZE[size];
  // viewBox 0..100; Radius so, dass Stroke innen bleibt.
  const center = 50;
  const radius = 50 - stroke / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped);

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          className="stroke-line"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          className="stroke-accent"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      {children != null ? (
        <div className="relative z-[1] flex max-h-full max-w-full items-center justify-center overflow-hidden px-1.5 text-center text-xs font-semibold tabular-nums text-ink">
          {children}
        </div>
      ) : null}
    </div>
  );
}
