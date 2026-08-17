/**
 * Default local time windows (Europe/Berlin wall clock as HH:mm).
 * Soft defaults when account insights are unavailable — never invent metrics.
 */

export const DEFAULT_FEED_TIMES = ['09:30', '13:00', '19:00'] as const;
/** First four = default Nur-Stories spread; extras fill up to 10, then sorted. */
export const DEFAULT_STORY_TIMES = [
  '08:15',
  '12:30',
  '17:45',
  '20:30',
  '10:00',
  '14:45',
  '16:15',
  '07:00',
  '18:30',
  '21:15',
] as const;

export function storyTimesForCount(count: number): string[] {
  const n = Math.max(0, Math.min(DEFAULT_STORY_TIMES.length, Math.round(count)));
  return [...DEFAULT_STORY_TIMES].slice(0, n).sort();
}

export function feedTimesForCount(count: number): string[] {
  const n = Math.max(0, Math.min(DEFAULT_FEED_TIMES.length, Math.round(count)));
  return [...DEFAULT_FEED_TIMES].slice(0, n);
}

export function parseHm(hm: string): { hour: number; minute: number } {
  const [h, m] = hm.split(':').map((x) => Number(x));
  return {
    hour: Number.isFinite(h) ? h : 12,
    minute: Number.isFinite(m) ? m : 0,
  };
}

/** Build ISO timestamptz for a calendar date + HH:mm in a fixed offset approximation.
 * Autopilot stores timestamptz; planning uses Europe/Berlin civil dates from the client/edge.
 * For V1 we encode as UTC+1/+2 via explicit offset passed by planner (cetOffsetHours).
 */
export function wallTimeToIso(params: {
  dateYmd: string; // YYYY-MM-DD
  hm: string;
  /** CET=1, CEST=2 */
  utcOffsetHours: number;
}): string {
  const { hour, minute } = parseHm(params.hm);
  const [y, mo, d] = params.dateYmd.split('-').map(Number);
  const utcMs = Date.UTC(y, mo - 1, d, hour - params.utcOffsetHours, minute, 0);
  return new Date(utcMs).toISOString();
}

/** Rough Berlin offset for a Y-M-D (CEST last Sunday March→October). Good enough for V1 slots. */
export function berlinUtcOffsetHours(dateYmd: string): number {
  const [y, mo, d] = dateYmd.split('-').map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  // Approximate EU DST: last Sunday of March to last Sunday of October
  const marchLastSun = lastSundayUtc(y, 2);
  const octLastSun = lastSundayUtc(y, 9);
  if (utc >= marchLastSun && utc < octLastSun) return 2;
  return 1;
}

function lastSundayUtc(year: number, monthIndex: number): Date {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0, 1, 0, 0));
  const day = last.getUTCDay();
  last.setUTCDate(last.getUTCDate() - day);
  return last;
}

export function enumerateDatesInclusive(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${startYmd}T12:00:00.000Z`);
  const end = new Date(`${endYmd}T12:00:00.000Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function weekdayIndexFromYmd(dateYmd: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const d = new Date(`${dateYmd}T12:00:00.000Z`);
  return d.getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}
