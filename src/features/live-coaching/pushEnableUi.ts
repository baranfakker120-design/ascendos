/**
 * Pure UI mode for Live Coaching push opt-in on Today.
 * Push subscription / T−45 / T−5 logic is unchanged — this only controls visibility.
 */

export const PUSH_SUCCESS_TOAST_MS = 4000;

export type PushEnableUiStatus =
  | 'loading'
  | 'unsupported'
  | 'missing_vapid'
  | 'denied'
  | 'default'
  | 'granted_unsubscribed'
  | 'subscribed';

export type PushEnableUiMode = 'hidden' | 'enable' | 'denied' | 'missing_vapid' | 'success_toast';

/**
 * Decide what to render on Heute / Admin push slot.
 * - Already subscribed on load → hidden (no permanent card)
 * - Just enabled → temporary success toast until `successUntilMs`
 * - Not subscribed → enable CTA (or denied / missing_vapid)
 */
export function resolvePushEnableUiMode(params: {
  status: PushEnableUiStatus;
  /** Epoch ms until which the success toast stays visible; null = not showing. */
  successUntilMs: number | null;
  nowMs: number;
}): PushEnableUiMode {
  const { status, successUntilMs, nowMs } = params;

  if (status === 'loading' || status === 'unsupported') return 'hidden';

  if (successUntilMs != null && nowMs < successUntilMs) {
    return 'success_toast';
  }

  if (status === 'subscribed') return 'hidden';
  if (status === 'denied') return 'denied';
  if (status === 'missing_vapid') return 'missing_vapid';
  return 'enable';
}
