import type { ReactNode } from 'react';
import { Card } from './Card';

export interface StatCardProps {
  /** Kurzlabel über dem Wert (Versalien-Stil über CSS). */
  label: string;
  /** Primärer Metrik-Wert. */
  value: ReactNode;
  /** Optionaler Hinweis unter dem Wert. */
  hint?: string;
  /** Optionaler dekorativer Slot (Icon) — keine Bedeutung allein. */
  icon?: ReactNode;
  className?: string;
}

/**
 * Eine Metrik-Kachel (AP, Firstline, …).
 * Surface/Line wie Card — keine Schatten, kein Akzent-Anstrich.
 */
export function StatCard({ label, value, hint, icon, className = '' }: StatCardProps) {
  const empty =
    value === null ||
    value === undefined ||
    value === '' ||
    (typeof value === 'number' && !Number.isFinite(value));

  return (
    <Card className={className}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        {icon != null ? <div className="shrink-0 text-muted">{icon}</div> : null}
      </div>
      <p className="mt-1 text-xl font-bold tabular-nums text-ink sm:text-2xl">
        {empty ? <span className="text-muted">—</span> : value}
      </p>
      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

/** Hilfstest / Formatierung ganzer AP-Zahlen für StatCard-Werte. */
export function formatStatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Math.trunc(value).toLocaleString('de-DE');
}
