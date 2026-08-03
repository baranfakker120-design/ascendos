/**
 * Canvas metal sheen — iOS-safe (no CSS mask-image).
 * White specular band × frame alpha via destination-in.
 */

export const SHEEN_CYCLE_MS = 7000;
export const SHEEN_SWEEP_MS = 1400;
export const SHEEN_ANGLE_DEG = 30;
export const SHEEN_BAND_RATIO = 0.11;

/** Progress 0..1 within the active sweep window; null while resting. */
export function sheenSweepProgress(elapsedMs: number): number | null {
  const t = ((elapsedMs % SHEEN_CYCLE_MS) + SHEEN_CYCLE_MS) % SHEEN_CYCLE_MS;
  if (t >= SHEEN_SWEEP_MS) return null;
  return t / SHEEN_SWEEP_MS;
}

/** Soft in/out envelope so the catch eases, not flashes. */
export function sheenOpacityEnvelope(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  // Smoothstep rise then fall across the sweep
  const rise = p < 0.2 ? p / 0.2 : 1;
  const fall = p > 0.75 ? (1 - p) / 0.25 : 1;
  const edge = Math.min(rise, fall);
  return edge * edge * (3 - 2 * edge);
}

/** Band center in unit space (−0.35 … 1.35) for a ~30° travel across the frame. */
export function sheenBandCenter(progress: number): number {
  return -0.35 + progress * 1.7;
}
