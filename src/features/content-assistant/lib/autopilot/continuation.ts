/** Client mirror of autopilot continuation helpers (unit-tested). */

export const AUTOPILOT_OPEN_SLOT_STATUSES = ['planned', 'ready', 'publishing'] as const;

export function isAutopilotPlanExhausted(params: {
  periodEnd: string;
  todayYmd: string;
  slots: ReadonlyArray<{ status: string }>;
}): boolean {
  const hasOpen = params.slots.some((s) =>
    (AUTOPILOT_OPEN_SLOT_STATUSES as readonly string[]).includes(s.status)
  );
  if (hasOpen) return false;
  if (params.slots.length === 0) return params.periodEnd < params.todayYmd;
  return true;
}

export function nextAutopilotPeriod(fromYmd: string): { start: string; end: string } {
  const start = fromYmd.slice(0, 10);
  const endDate = new Date(`${start}T12:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  return { start, end: endDate.toISOString().slice(0, 10) };
}

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
