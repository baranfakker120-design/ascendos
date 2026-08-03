import { describe, expect, it } from 'vitest';
import {
  ENERGY_FLOW_SPEED,
  easeEnergyFill,
  energyGlowPulse,
  seedEnergyParticles,
} from './energyCoreMath';

describe('energyCoreMath', () => {
  it('eases fill toward the target without overshooting wildly', () => {
    const next = easeEnergyFill(0.2, 0.8, 280);
    expect(next).toBeGreaterThan(0.2);
    expect(next).toBeLessThan(0.8);
  });

  it('seeds a calm particle field', () => {
    const particles = seedEnergyParticles(10);
    expect(particles).toHaveLength(10);
    expect(particles.every((p) => p.x >= 0 && p.x <= 1)).toBe(true);
  });

  it('pulses glow only inside the wave window', () => {
    expect(energyGlowPulse(500, null)).toBe(0);
    expect(energyGlowPulse(950, 500)).toBeGreaterThan(0);
    expect(energyGlowPulse(2000, 500)).toBe(0);
  });

  it('keeps flow speed subtle', () => {
    expect(ENERGY_FLOW_SPEED).toBeGreaterThan(0);
    expect(ENERGY_FLOW_SPEED).toBeLessThan(0.01);
  });
});
