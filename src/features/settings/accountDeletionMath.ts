/** Pure helpers for account-deletion UI (no Supabase client import). */

/** Whole days remaining until scheduled deletion (ceil). Min 0. */
export function daysUntilDeletion(
  scheduledForIso: string | null | undefined,
  now = new Date()
): number {
  if (!scheduledForIso) return 0;
  const due = Date.parse(scheduledForIso);
  if (!Number.isFinite(due)) return 0;
  const ms = due - now.getTime();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
