export interface CalendarEventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string | Date;
  durationMinutes: number;
  url?: string | null;
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** UTC compact form for ICS / Google. */
export function toUtcStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function endDate(startsAt: Date, durationMinutes: number): Date {
  return new Date(startsAt.getTime() + durationMinutes * 60_000);
}

function encode(text: string): string {
  return encodeURIComponent(text);
}

export function buildGoogleCalendarUrl(input: CalendarEventInput): string {
  const start = toDate(input.startsAt);
  const end = endDate(start, input.durationMinutes);
  const dates = `${toUtcStamp(start)}/${toUtcStamp(end)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates,
  });
  const details = [input.description, input.url].filter(Boolean).join('\n\n');
  if (details) params.set('details', details);
  if (input.location) params.set('location', input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildOutlookCalendarUrl(input: CalendarEventInput): string {
  const start = toDate(input.startsAt);
  const end = endDate(start, input.durationMinutes);
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: input.title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
  });
  const body = [input.description, input.url].filter(Boolean).join('\n\n');
  if (body) params.set('body', body);
  if (input.location) params.set('location', input.location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/** Apple Calendar via downloadable ICS data URL / blob. */
export function buildIcsContent(input: CalendarEventInput): string {
  const start = toDate(input.startsAt);
  const end = endDate(start, input.durationMinutes);
  const uid = `coaching-${toUtcStamp(start)}-${encode(input.title).slice(0, 24)}@ascendos`;
  const desc = [input.description, input.url].filter(Boolean).join('\\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AscendOS//Live Coaching//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toUtcStamp(new Date())}`,
    `DTSTART:${toUtcStamp(start)}`,
    `DTEND:${toUtcStamp(end)}`,
    `SUMMARY:${escapeIcs(input.title)}`,
  ];
  if (desc) lines.push(`DESCRIPTION:${escapeIcs(desc)}`);
  if (input.location) lines.push(`LOCATION:${escapeIcs(input.location)}`);
  if (input.url) lines.push(`URL:${input.url}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function downloadAppleIcs(input: CalendarEventInput, filename = 'live-coaching.ics'): void {
  const blob = new Blob([buildIcsContent(input)], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}
