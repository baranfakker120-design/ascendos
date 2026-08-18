/** Europe/Berlin calendar labels for Radar hits (no media). */

const BERLIN = 'Europe/Berlin';

export function radarBerlinYmd(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function radarBerlinTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(locale, {
    timeZone: BERLIN,
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function radarBerlinDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, {
    timeZone: BERLIN,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
}

/** 0 = today, -1 = yesterday (Europe/Berlin). */
export function radarBerlinDayOffset(iso: string, now: Date = new Date()): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const startYmd = radarBerlinYmd(d);
  const nowYmd = radarBerlinYmd(now);
  const startMid = Date.parse(`${startYmd}T12:00:00Z`);
  const nowMid = Date.parse(`${nowYmd}T12:00:00Z`);
  return Math.round((startMid - nowMid) / 86_400_000);
}

export type RadarWhenKind = 'today' | 'yesterday' | 'date';

export function radarWhenKind(iso: string, now: Date = new Date()): RadarWhenKind {
  const offset = radarBerlinDayOffset(iso, now);
  if (offset === 0) return 'today';
  if (offset === -1) return 'yesterday';
  return 'date';
}
