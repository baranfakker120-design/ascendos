/**
 * Liquid Energy Core — Canvas plasma / liquid-metal fill.
 * Continuous flow, soft highlights, glow wave on progress change.
 * No CSS-only gradient bar.
 */

export const ENERGY_FLOW_SPEED = 0.00035;
export const ENERGY_PARTICLE_COUNT = 14;

export interface EnergyParticle {
  x: number;
  y: number;
  r: number;
  speed: number;
  alpha: number;
}

export function seedEnergyParticles(count = ENERGY_PARTICLE_COUNT): EnergyParticle[] {
  const out: EnergyParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      x: (i / count) * 0.9 + 0.05,
      y: 0.25 + ((i * 37) % 50) / 100,
      r: 0.8 + (i % 4) * 0.35,
      speed: 0.04 + (i % 5) * 0.012,
      alpha: 0.25 + (i % 3) * 0.15,
    });
  }
  return out;
}

/** Softstep for fill width animation toward target ratio. */
export function easeEnergyFill(current: number, target: number, dtMs: number): number {
  const k = 1 - Math.exp(-dtMs / 280);
  return current + (target - current) * k;
}

export function energyGlowPulse(elapsedMs: number, triggerMs: number | null): number {
  if (triggerMs == null) return 0;
  const t = (elapsedMs - triggerMs) / 900;
  if (t < 0 || t > 1) return 0;
  return Math.sin(t * Math.PI) * 0.55;
}
