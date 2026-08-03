import { describe, expect, it } from 'vitest';
import {
  ENERGY_CHARGE_MS,
  ENERGY_FLOW_SPEED,
  easeEnergyFill,
  energyChargeBoost,
  energyCurrentY,
  energyGlowPulse,
  energyMeniscusOffset,
  energyParticleSpeedMul,
  energyTurbulence,
  energyWaveProgress,
  seedEnergyCaustics,
  seedEnergyParticles,
} from './energyCoreMath';

describe('energyCoreMath', () => {
  it('eases fill toward the target without overshooting wildly', () => {
    const next = easeEnergyFill(0.2, 0.8, 280);
    expect(next).toBeGreaterThan(0.2);
    expect(next).toBeLessThan(0.8);
  });

  it('seeds particles and caustic pools', () => {
    expect(seedEnergyParticles(10)).toHaveLength(10);
    expect(seedEnergyCaustics(9)).toHaveLength(9);
  });

  it('charges like a battery — boost, wave, then calm', () => {
    expect(energyChargeBoost(500, null)).toBe(0);
    expect(energyChargeBoost(700, 500)).toBeGreaterThan(0.4);
    expect(energyChargeBoost(500 + ENERGY_CHARGE_MS + 10, 500)).toBe(0);
    const wave = energyWaveProgress(900, 500);
    expect(wave).not.toBeNull();
    expect(wave!).toBeGreaterThan(0);
    expect(wave!).toBeLessThanOrEqual(1);
    expect(energyParticleSpeedMul(1)).toBeGreaterThan(3);
    expect(energyParticleSpeedMul(0)).toBe(1);
  });

  it('pulses glow only inside the charge window', () => {
    expect(energyGlowPulse(500, null)).toBe(0);
    expect(energyGlowPulse(1100, 500)).toBeGreaterThan(0);
    expect(energyGlowPulse(500 + ENERGY_CHARGE_MS + 50, 500)).toBe(0);
  });

  it('keeps liquid math bounded for stable paint', () => {
    expect(ENERGY_FLOW_SPEED).toBeGreaterThan(0);
    expect(ENERGY_FLOW_SPEED).toBeLessThan(0.01);
    const t = energyTurbulence(0.4, 1.2, 2);
    expect(t).toBeGreaterThanOrEqual(-1);
    expect(t).toBeLessThanOrEqual(1);
    const m = energyMeniscusOffset(0.5, 1.2, 0.4);
    expect(Number.isFinite(m)).toBe(true);
    const y = energyCurrentY(1, 0.4, 2);
    expect(y).toBeGreaterThan(0.1);
    expect(y).toBeLessThan(0.95);
  });
});
