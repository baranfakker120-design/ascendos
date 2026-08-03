/**
 * Liquid Energy Core — battery-cell physics helpers (pure, testable).
 * Paint stays in EnergyCore; math stays cheap for 60fps.
 */

export const ENERGY_FLOW_SPEED = 0.00028;
export const ENERGY_PARTICLE_COUNT = 22;
export const ENERGY_CAUSTIC_COUNT = 9;
/** Charge reaction after AP gain (ms). */
export const ENERGY_CHARGE_MS = 1400;

export interface EnergyParticle {
  x: number;
  y: number;
  r: number;
  speed: number;
  alpha: number;
  phase: number;
  drift: number;
}

export interface EnergyCaustic {
  x: number;
  y: number;
  r: number;
  speed: number;
  phase: number;
  alpha: number;
}

export function seedEnergyParticles(count = ENERGY_PARTICLE_COUNT): EnergyParticle[] {
  const out: EnergyParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      x: ((i * 0.137) % 0.92) + 0.04,
      y: 0.16 + ((i * 47) % 68) / 100,
      r: 0.45 + (i % 5) * 0.22,
      speed: 0.018 + (i % 7) * 0.008,
      alpha: 0.14 + (i % 5) * 0.08,
      phase: (i * 0.91) % (Math.PI * 2),
      drift: 0.35 + (i % 4) * 0.15,
    });
  }
  return out;
}

export function seedEnergyCaustics(count = ENERGY_CAUSTIC_COUNT): EnergyCaustic[] {
  const out: EnergyCaustic[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      x: ((i * 0.21) % 0.85) + 0.08,
      y: 0.25 + ((i * 29) % 50) / 100,
      r: 0.08 + (i % 4) * 0.035,
      speed: 0.012 + (i % 5) * 0.006,
      phase: i * 1.37,
      alpha: 0.08 + (i % 3) * 0.04,
    });
  }
  return out;
}

/** Critically-damped-ish fill ease toward target. */
export function easeEnergyFill(current: number, target: number, dtMs: number): number {
  const k = 1 - Math.exp(-dtMs / 380);
  return current + (target - current) * k;
}

export function energyGlowPulse(elapsedMs: number, triggerMs: number | null): number {
  if (triggerMs == null) return 0;
  const t = (elapsedMs - triggerMs) / ENERGY_CHARGE_MS;
  if (t < 0 || t > 1) return 0;
  return Math.sin(t * Math.PI) * 0.75;
}

/** Battery charge envelope — surge then settle. */
export function energyChargeBoost(nowMs: number, triggerMs: number | null): number {
  if (triggerMs == null) return 0;
  const t = (nowMs - triggerMs) / ENERGY_CHARGE_MS;
  if (t < 0 || t > 1) return 0;
  const rise = Math.min(1, t / 0.14);
  const fall = t > 0.28 ? 1 - (t - 0.28) / 0.72 : 1;
  const env = Math.min(rise, Math.max(0, fall));
  return env * env * (3 - 2 * env);
}

/** Wave front 0..1 across the fill during charge. */
export function energyWaveProgress(nowMs: number, triggerMs: number | null): number | null {
  if (triggerMs == null) return null;
  const t = (nowMs - triggerMs) / ENERGY_CHARGE_MS;
  if (t < 0 || t > 0.92) return null;
  // Ease-out travel so the front spends time readable
  const u = Math.min(1, t / 0.85);
  return 1 - (1 - u) * (1 - u);
}

export function energyParticleSpeedMul(boost: number): number {
  return 1 + boost * 3.2;
}

/** Stacked sines — liquid turbulence (−1..1). */
export function energyTurbulence(x: number, t: number, seed = 0): number {
  return (
    Math.sin(x * 5.4 + t * 1.15 + seed) * 0.5 +
    Math.sin(x * 11.8 - t * 1.7 + seed * 1.6) * 0.32 +
    Math.sin(x * 23.2 + t * 0.65 + seed * 0.5) * 0.18
  );
}

/**
 * Free-surface meniscus offset at leading edge (px-normalized −0.5..0.5 of height).
 * Looks like liquid pressed against glass, not a flat cut.
 */
export function energyMeniscusOffset(y01: number, timeSec: number, boost = 0): number {
  const wave =
    Math.sin(y01 * Math.PI * 2 + timeSec * 1.4) * 0.08 +
    Math.sin(y01 * Math.PI * 4 - timeSec * 2.1) * 0.04;
  return (wave + boost * 0.06) * (0.55 + energyTurbulence(y01, timeSec, 3) * 0.15);
}

/** Horizontal current layer y for stratified liquid. */
export function energyCurrentY(layer: number, x01: number, timeSec: number): number {
  const base = 0.22 + layer * 0.28;
  return (
    base +
    Math.sin(x01 * Math.PI * 2 * (1.2 + layer * 0.4) + timeSec * (0.55 + layer * 0.2)) * 0.05 +
    energyTurbulence(x01, timeSec * 0.7, layer) * 0.02
  );
}

/** Spring curve token for CSS (overshoot). */
export const SPRING_SNAPPY = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
export const SPRING_SOFT = 'cubic-bezier(0.22, 1.2, 0.36, 1)';
export const SPRING_SETTLE = 'cubic-bezier(0.16, 1, 0.3, 1)';
