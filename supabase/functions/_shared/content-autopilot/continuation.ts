/** Pure helpers: when to auto-continue Autopilot without user confirmation. */

export const AUTOPILOT_OPEN_SLOT_STATUSES = [
  'planned',
  'ready',
  'publishing',
] as const;

export const AUTOPILOT_TERMINAL_SLOT_STATUSES = [
  'published',
  'skipped',
  'failed',
  'cancelled',
] as const;

export type AutopilotOpenSlotStatus = (typeof AUTOPILOT_OPEN_SLOT_STATUSES)[number];

/**
 * A plan is exhausted when nothing remains to publish/claim.
 * Used by cron to start the next period without daily user confirmation.
 */
export function isAutopilotPlanExhausted(params: {
  periodEnd: string; // YYYY-MM-DD
  todayYmd: string;
  slots: ReadonlyArray<{ status: string }>;
}): boolean {
  const hasOpen = params.slots.some((s) =>
    (AUTOPILOT_OPEN_SLOT_STATUSES as readonly string[]).includes(s.status)
  );
  if (hasOpen) return false;
  if (params.slots.length === 0) {
    // Empty active plan past end → continue; empty future plan → wait
    return params.periodEnd < params.todayYmd;
  }
  return true;
}

/** Next 7-day window starting at `fromYmd` (inclusive). */
export function nextAutopilotPeriod(fromYmd: string): { start: string; end: string } {
  const start = fromYmd.slice(0, 10);
  const endDate = new Date(`${start}T12:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  return { start, end: endDate.toISOString().slice(0, 10) };
}

/** Permanent publish errors — do not infinite-retry; release claim to failed. */
export function isPermanentAutopilotPublishError(error: string): boolean {
  return [
    'draft_not_ready',
    'asset_not_found',
    'missing_caption',
    'missing_publish_permission',
    'missing_token',
    'token_decrypt_failed',
  ].includes(error);
}
