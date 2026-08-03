import { describe, expect, it } from 'vitest';
import {
  ENERGY_CHARGE_MS,
  ENERGY_FLOW_SPEED,
  easeEnergyFill,
  energyChargeBoost,
  energyGlowPulse,
  energyParticleSpeedMul,
  energyTurbulence,
  energyVeinY,
  energyWaveProgress,
  seedEnergyParticles,
  seedEnergyVeins,
} from './energyCoreMath';

describe('energyCoreMath', () => {
  it('eases fill toward the target without overshooting wildly', () => {
    const next = easeEnergyFill(0.2, 0.8, 280);
    expect(next).toBeGreaterThan(0.2);
    expect(next).toBeLessThan(0.8);
  });

  it('seeds a calm particle field and light veins', () => {
    const particles = seedEnergyParticles(10);
    expect(particles).toHaveLength(10);
    expect(particles.every((p) => p.x >= 0 && p.x <= 1)).toBe(true);
    expect(seedEnergyVeins(5)).toHaveLength(5);
  });

  it('charges like a battery — boost, wave, then calm', () => {
    expect(energyChargeBoost(500, null)).toBe(0);
    expect(energyChargeBoost(700, 500)).toBeGreaterThan(0.5);
    expect(energyChargeBoost(500 + ENERGY_CHARGE_MS + 10, 500)).toBe(0);
    expect(energyWaveProgress(800, 500)).toBeGreaterThan(0);
    expect(energyWaveProgress(800, 500)).toBeLessThanOrEqual(1);
    expect(energyParticleSpeedMul(1)).toBeGreaterThan(2);
    expect(energyParticleSpeedMul(0)).toBe(1);
  });

  it('pulses glow only inside the charge window', () => {
    expect(energyGlowPulse(500, null)).toBe(0);
    expect(energyGlowPulse(950, 500)).toBeGreaterThan(0);
    expect(energyGlowPulse(500 + ENERGY_CHARGE_MS + 50, 500)).toBe(0);
  });

  it('keeps flow speed subtle and turbulence bounded', () => {
    expect(ENERGY_FLOW_SPEED).toBeGreaterThan(0);
    expect(ENERGY_FLOW_SPEED).toBeLessThan(0.01);
    const t = energyTurbulence(0.4, 1.2, 2);
    expect(t).toBeGreaterThanOrEqual(-1);
    expect(t).toBeLessThanOrEqual(1);
    const vein = seedEnergyVeins(1)[0];
    const y = energyVeinY(vein, 0.5, 1, 0.4);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(1);
  });
});
