/**
 * Pure helpers for AscendOS signature liquid-champagne light.
 * Presentation math only — no DOM.
 */

export const LIQUID_MAX_OFFSET_PX = 8;
export const LIQUID_RELEASE_MS = 300;
/** easeOutExpo */
export const LIQUID_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

export interface LiquidPoint {
  x: number;
  y: number;
}

/** Clamp a delta vector to max radius (surface tension). */
export function clampLiquidOffset(dx: number, dy: number, max = LIQUID_MAX_OFFSET_PX): LiquidPoint {
  const dist = Math.hypot(dx, dy);
  if (dist <= max || dist === 0) return { x: dx, y: dy };
  const s = max / dist;
  return { x: dx * s, y: dy * s };
}

/** Soft follow with lag (0..1). */
export function lerpLiquid(current: number, target: number, factor = 0.22): number {
  return current + (target - current) * factor;
}

/**
 * Slight stretch along motion axis; compression on the perpendicular.
 * velocity is px per frame-ish; keep subtle.
 */
export function liquidStretch(vx: number, vy: number): { scaleX: number; scaleY: number } {
  const speed = Math.min(1, Math.hypot(vx, vy) / 10);
  const angle = Math.atan2(vy, vx);
  const stretch = 1 + speed * 0.18;
  const compress = 1 - speed * 0.1;
  // Approximate axis-aligned stretch from dominant direction.
  const ax = Math.abs(Math.cos(angle));
  const ay = Math.abs(Math.sin(angle));
  return {
    scaleX: compress + (stretch - compress) * ax,
    scaleY: compress + (stretch - compress) * ay,
  };
}

export function easeOutExpo(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.pow(2, -10 * t);
}
