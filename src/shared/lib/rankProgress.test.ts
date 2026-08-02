import { describe, expect, it } from 'vitest';
import { computeRankProgress, rankProgressPercent } from './rankProgress';

describe('computeRankProgress', () => {
  it('liefert 0 am Anfang einer Stufe', () => {
    const p = computeRankProgress({ ap: 250, currentThreshold: 250, nextThreshold: 1250 });
    expect(p.isMaxRank).toBe(false);
    expect(p.ratio).toBe(0);
    expect(p.remainingAp).toBe(1000);
    expect(rankProgressPercent(p)).toBe(0);
  });

  it('liefert die Mitte einer Stufe', () => {
    const p = computeRankProgress({ ap: 750, currentThreshold: 250, nextThreshold: 1250 });
    expect(p.ratio).toBe(0.5);
    expect(p.remainingAp).toBe(500);
    expect(rankProgressPercent(p)).toBe(50);
  });

  it('klemmt bei AP über der nächsten Schwelle auf 1', () => {
    const p = computeRankProgress({ ap: 2000, currentThreshold: 250, nextThreshold: 1250 });
    expect(p.ratio).toBe(1);
    expect(p.remainingAp).toBe(0);
  });

  it('markiert den höchsten Rang ohne nächste Schwelle', () => {
    const p = computeRankProgress({ ap: 50000, currentThreshold: 50000, nextThreshold: null });
    expect(p.isMaxRank).toBe(true);
    expect(p.ratio).toBe(1);
    expect(p.remainingAp).toBe(0);
    expect(rankProgressPercent(p)).toBe(100);
  });

  it('behandelt ungültige nächste Schwelle wie Max-Rang', () => {
    const p = computeRankProgress({ ap: 100, currentThreshold: 250, nextThreshold: 100 });
    expect(p.isMaxRank).toBe(true);
  });

  it('ignoriert negative Eingaben defensiv', () => {
    const p = computeRankProgress({ ap: -10, currentThreshold: -5, nextThreshold: 100 });
    expect(p.ratio).toBe(0);
    expect(p.remainingAp).toBe(100);
  });
});
