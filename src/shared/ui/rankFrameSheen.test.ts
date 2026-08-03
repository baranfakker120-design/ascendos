import { describe, expect, it } from 'vitest'
import {
  SHEEN_ANGLE_DEG,
  SHEEN_BAND_RATIO,
  SHEEN_CYCLE_MS,
  SHEEN_SWEEP_MS,
  sheenBandCenter,
  sheenOpacityEnvelope,
  sheenSweepProgress,
} from './frameSheenMath'

describe('frameSheenMath', () => {
  it('repeats every 6–8 seconds so the sweep is visible within a 10s glance', () => {
    expect(SHEEN_CYCLE_MS).toBeGreaterThanOrEqual(6000)
    expect(SHEEN_CYCLE_MS).toBeLessThanOrEqual(8000)
    expect(SHEEN_SWEEP_MS).toBeGreaterThanOrEqual(1000)
    expect(SHEEN_SWEEP_MS).toBeLessThan(SHEEN_CYCLE_MS)
    expect(SHEEN_CYCLE_MS).toBeLessThanOrEqual(10000)
  })

  it('uses a narrow ~30° luxury-watch band', () => {
    expect(SHEEN_ANGLE_DEG).toBeGreaterThanOrEqual(25)
    expect(SHEEN_ANGLE_DEG).toBeLessThanOrEqual(35)
    expect(SHEEN_BAND_RATIO).toBeGreaterThan(0.06)
    expect(SHEEN_BAND_RATIO).toBeLessThan(0.18)
  })

  it('keeps the band off-canvas outside the active sweep window', () => {
    expect(sheenSweepProgress(SHEEN_SWEEP_MS + 1)).toBeNull()
    expect(sheenSweepProgress(SHEEN_CYCLE_MS - 1)).toBeNull()
  })

  it('moves the band across the frame during the sweep', () => {
    const start = sheenSweepProgress(0)
    const mid = sheenSweepProgress(SHEEN_SWEEP_MS / 2)
    const late = sheenSweepProgress(SHEEN_SWEEP_MS * 0.9)
    expect(start).toBe(0)
    expect(mid).not.toBeNull()
    expect(late).not.toBeNull()
    expect(mid!).toBeGreaterThan(start!)
    expect(late!).toBeGreaterThan(mid!)
    expect(sheenBandCenter(mid!)).toBeGreaterThan(sheenBandCenter(start!))
  })

  it('softens opacity at the edges of the sweep', () => {
    expect(sheenOpacityEnvelope(0)).toBeLessThan(0.05)
    expect(sheenOpacityEnvelope(0.5)).toBeGreaterThan(0.9)
    expect(sheenOpacityEnvelope(1)).toBeLessThan(0.05)
  })
})
