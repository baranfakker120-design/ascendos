/**
 * Liquid Energy Core math — glass + plasma feel, 60fps-friendly.
 * Pure functions only (testable). Paint stays in EnergyCore.
 */

export const ENERGY_FLOW_SPEED = 0.00042;
export const ENERGY_PARTICLE_COUNT = 18;
export const ENERGY_VEIN_COUNT = 5;
/** Charge reaction window after AP gain (ms). */
export const ENERGY_CHARGE_MS = 1200;

export interface EnergyParticle {
  x: number;
  y: number;
  r: number;
  /** Base speed in normalized units / second */
  speed: number;
  alpha: number;
  phase: number;
}

export interface EnergyVein {
  /** Vertical anchor 0..1 */
  y: number;
  amp: number;
  freq: number;
  phase: number;
  width: number;
  alpha: number;
}

export function seedEnergyParticles(count = ENERGY_PARTICLE_COUNT): EnergyParticle[] {
  const out: EnergyParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      x: (i / count) * 0.9 + 0.05,
      y: 0.18 + ((i * 41) % 64) / 100,
      r: 0.55 + (i % 5) * 0.28,
      speed: 0.035 + (i % 6) * 0.014,
      alpha: 0.22 + (i % 4) * 0.12,
      phase: (i * 0.73) % (Math.PI * 2),
    });
  }
  return out;
}

export function seedEnergyVeins(count = ENERGY_VEIN_COUNT): EnergyVein[] {
  const out: EnergyVein[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      y: 0.22 + i * (0.56 / Math.max(1, count - 1)),
      amp: 0.04 + (i % 3) * 0.018,
      freq: 1.6 + (i % 4) * 0.55,
      phase: i * 1.1,
      width: 1.2 + (i % 3) * 0.4,
      alpha: 0.12 + (i % 3) * 0.05,
    });
  }
  return out;
}

/** Softstep for fill width animation toward target ratio. */
export function easeEnergyFill(current: number, target: number, dtMs: number): number {
  const k = 1 - Math.exp(-dtMs / 320);
  return current + (target - current) * k;
}

/** Soft glow envelope on the leading edge during charge. */
export function energyGlowPulse(elapsedMs: number, triggerMs: number | null): number {
  if (triggerMs == null) return 0;
  const t = (elapsedMs - triggerMs) / ENERGY_CHARGE_MS;
  if (t < 0 || t > 1) return 0;
  return Math.sin(t * Math.PI) * 0.7;
}

/**
 * Charge intensity 0..1 after AP gain.
 * Peaks early, then settles — battery recharge feel.
 */
export function energyChargeBoost(nowMs: number, triggerMs: number | null): number {
  if (triggerMs == null) return 0;
  const t = (nowMs - triggerMs) / ENERGY_CHARGE_MS;
  if (t < 0 || t > 1) return 0;
  // Fast rise, soft settle
  const rise = Math.min(1, t / 0.18);
  const fall = t > 0.35 ? 1 - (t - 0.35) / 0.65 : 1;
  const env = Math.min(rise, Math.max(0, fall));
  return env * env * (3 - 2 * env);
}

/** Traveling light wave position across the fill (0..1) during charge. */
export function energyWaveProgress(nowMs: number, triggerMs: number | null): number | null {
  if (triggerMs == null) return null;
  const t = (nowMs - triggerMs) / ENERGY_CHARGE_MS;
  if (t < 0 || t > 1) return null;
  return Math.min(1, t * 1.15);
}

/** Particle speed multiplier during charge (calm → surge → calm). */
export function energyParticleSpeedMul(boost: number): number {
  return 1 + boost * 2.8;
}

/**
 * Cheap turbulence offset (−1..1) — no Perlin, sin stack only.
 * Stable across frames for veins / refraction wobble.
 */
export function energyTurbulence(x: number, t: number, seed = 0): number {
  return (
    Math.sin(x * 6.2 + t * 1.7 + seed) * 0.55 +
    Math.sin(x * 13.1 - t * 2.3 + seed * 1.7) * 0.3 +
    Math.sin(x * 27.4 + t * 0.9 + seed * 0.4) * 0.15
  );
}

/** Vein centerline y at normalized x. */
export function energyVeinY(vein: EnergyVein, x01: number, timeSec: number, boost = 0): number {
  const turb = energyTurbulence(x01, timeSec, vein.phase) * (0.012 + boost * 0.02);
  return (
    vein.y +
    Math.sin(x01 * Math.PI * 2 * vein.freq + timeSec * (1.1 + boost) + vein.phase) * vein.amp +
    turb
  );
}
