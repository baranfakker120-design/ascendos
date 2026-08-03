import { describe, expect, it } from 'vitest';
import {
  buildGoogleCalendarUrl,
  buildIcsContent,
  buildOutlookCalendarUrl,
  toUtcStamp,
} from './calendarLinks';

describe('calendarLinks', () => {
  const input = {
    title: 'Live Coaching',
    description: 'Weekly call',
    startsAt: '2026-08-03T18:00:00.000Z',
    durationMinutes: 60,
    url: 'https://zoom.us/j/123',
  };

  it('builds Google / Outlook / Apple ICS', () => {
    expect(buildGoogleCalendarUrl(input)).toContain('calendar.google.com');
    expect(buildGoogleCalendarUrl(input)).toContain(toUtcStamp(new Date(input.startsAt)));
    expect(buildOutlookCalendarUrl(input)).toContain('outlook.live.com');
    expect(buildIcsContent(input)).toContain('BEGIN:VEVENT');
    expect(buildIcsContent(input)).toContain('SUMMARY:Live Coaching');
  });
});
