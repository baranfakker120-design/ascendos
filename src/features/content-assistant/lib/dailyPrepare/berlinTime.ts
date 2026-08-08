/** Europe/Berlin calendar helpers — mirrors edge `_shared/content-daily/berlinTime`. */

export const BERLIN_TZ = 'Europe/Berlin';
export const BERLIN_NOON_HOUR = 12;
export const BERLIN_NOON_WINDOW_MINUTES = 20;

function berlinParts(now: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/** YYYY-MM-DD for the calendar day in Europe/Berlin. */
export function berlinPrepDate(now = new Date()): string {
  const { year, month, day } = berlinParts(now);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** True when local Berlin time is 12:00 .. 12:(WINDOW-1). */
export function isBerlinNoonWindow(
  now = new Date(),
  windowMinutes = BERLIN_NOON_WINDOW_MINUTES
): boolean {
  const { hour, minute } = berlinParts(now);
  return hour === BERLIN_NOON_HOUR && minute >= 0 && minute < windowMinutes;
}

export function subtractDaysFromDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
