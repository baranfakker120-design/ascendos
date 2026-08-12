/** Europe/Berlin calendar helpers for Live Coaching presentation. */

const BERLIN = 'Europe/Berlin';

/** YYYY-MM-DD in Europe/Berlin. */
export function berlinYmd(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatBerlinTime(iso: string | Date, locale = 'de'): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return d.toLocaleTimeString(locale, {
    timeZone: BERLIN,
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatBerlinDate(iso: string | Date, locale = 'de'): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return d.toLocaleDateString(locale, {
    timeZone: BERLIN,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Calendar-day offset of `startsAt` vs `now` in Europe/Berlin
 * (0 = heute, 1 = morgen, negative = past day).
 */
export function berlinCalendarDayOffset(
  startsAt: string | Date,
  now: Date = new Date()
): number {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  const startYmd = berlinYmd(start);
  const nowYmd = berlinYmd(now);
  const startMid = Date.parse(`${startYmd}T12:00:00Z`);
  const nowMid = Date.parse(`${nowYmd}T12:00:00Z`);
  return Math.round((startMid - nowMid) / 86_400_000);
}

/** End clock from local datetime-local start + duration (minutes). */
export function endLocalInputValue(startsLocal: string, durationMinutes: number): string {
  if (!startsLocal || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return '';
  const start = new Date(startsLocal);
  if (Number.isNaN(start.getTime())) return '';
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

export function formatEndClock(
  startsLocal: string,
  durationMinutes: number,
  locale = 'de'
): string {
  const end = endLocalInputValue(startsLocal, durationMinutes);
  if (!end) return '';
  return new Date(end).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}
