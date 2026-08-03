import type { LiveCoachingState } from './types';

export interface LiveWindowInput {
  startsAt: string | Date;
  durationMinutes: number;
  now?: Date;
}

export function endsAt(startsAt: Date, durationMinutes: number): Date {
  return new Date(startsAt.getTime() + durationMinutes * 60_000);
}

export function resolveLiveCoachingState(input: LiveWindowInput): LiveCoachingState {
  const now = input.now ?? new Date();
  const start = input.startsAt instanceof Date ? input.startsAt : new Date(input.startsAt);
  const end = endsAt(start, input.durationMinutes);
  if (now < start) return 'countdown';
  if (now <= end) return 'live';
  return 'finished';
}

export function countdownParts(
  startsAt: string | Date,
  now: Date = new Date()
): { totalMs: number; days: number; hours: number; minutes: number; seconds: number } {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  const totalMs = Math.max(0, start.getTime() - now.getTime());
  const seconds = Math.floor(totalMs / 1000) % 60;
  const minutes = Math.floor(totalMs / 60_000) % 60;
  const hours = Math.floor(totalMs / 3_600_000) % 24;
  const days = Math.floor(totalMs / 86_400_000);
  return { totalMs, days, hours, minutes, seconds };
}

export function formatCountdown(startsAt: string | Date, now: Date = new Date()): string {
  const { days, hours, minutes, seconds, totalMs } = countdownParts(startsAt, now);
  if (totalMs <= 0) return 'LIVE';
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
