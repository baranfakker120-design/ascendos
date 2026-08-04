/** Kurzes Premium-Haptic für Nav-Taps (120–180 ms). */
export function triggerNavHaptic(durationMs = 150): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const ms = Math.min(180, Math.max(120, Math.round(durationMs)));
  try {
    navigator.vibrate(ms);
  } catch {
    // Vibration ist optional — nie die Interaktion blockieren.
  }
}
