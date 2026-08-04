import { describe, expect, it } from 'vitest';
import { resolveDisplayFrameKey, SPECIAL_FRAME } from './frameAssets';

describe('resolveDisplayFrameKey', () => {
  it('gibt super_admin immer frame-09', () => {
    expect(
      resolveDisplayFrameKey({
        role: 'super_admin',
        rankFrameKey: 'frame-01',
        isBeraterDesMonats: true,
      })
    ).toBe(SPECIAL_FRAME.super_admin);
  });

  it('gibt developer frame-08 (unterhalb super_admin)', () => {
    expect(
      resolveDisplayFrameKey({
        role: 'developer',
        rankFrameKey: 'frame-03',
      })
    ).toBe(SPECIAL_FRAME.developer);
  });

  it('gibt Berater des Monats frame-10', () => {
    expect(
      resolveDisplayFrameKey({
        role: 'berater',
        rankFrameKey: 'frame-02',
        isBeraterDesMonats: true,
      })
    ).toBe(SPECIAL_FRAME.berater_des_monats);
  });

  it('fällt sonst auf den AP-Rahmen zurück', () => {
    expect(
      resolveDisplayFrameKey({
        role: 'leader',
        rankFrameKey: 'frame-05',
      })
    ).toBe('frame-05');
    expect(resolveDisplayFrameKey({ role: 'berater', rankFrameKey: null })).toBeNull();
  });

  it('nutzt equipped Frame unterhalb von Status-Rahmen', () => {
    expect(
      resolveDisplayFrameKey({
        role: 'berater',
        rankFrameKey: 'frame-02',
        equippedFrameKey: 'frame-04',
      })
    ).toBe('frame-04');
    expect(
      resolveDisplayFrameKey({
        role: 'super_admin',
        rankFrameKey: 'frame-02',
        equippedFrameKey: 'frame-04',
      })
    ).toBe(SPECIAL_FRAME.super_admin);
  });
});
