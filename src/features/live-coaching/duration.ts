/** Pure duration validation — no Supabase / browser deps (CI-safe). */

export function assertValidDuration(minutes: number): void {
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 480) {
    throw new Error('invalid_duration');
  }
}
