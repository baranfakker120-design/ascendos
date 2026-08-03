import { describe, expect, it } from 'vitest';
import {
  AVATAR_FILL_RATIO,
  FRAME_DISPLAY_PX,
  FRAME_GEOMETRY,
  HOLE_DISPLAY_SCALE,
  frameAvatarLayout,
  getFrameGeometry,
  openingLayout,
  pickFrameAssetPx,
  resolveDisplayFrameKey,
  resolveFrameSrc,
  resolveFrameSrcSet,
  FRAME_ASSET_PX,
  SPECIAL_FRAME,
} from './frameAssets';

describe('frameAssets', () => {
  it('kennt die zehn vermessenen Rahmen aus dem Sprint-4-Plan', () => {
    expect(Object.keys(FRAME_GEOMETRY).sort()).toEqual([
      'frame-01',
      'frame-02',
      'frame-03',
      'frame-04',
      'frame-05',
      'frame-06',
      'frame-07',
      'frame-08',
      'frame-09',
      'frame-10',
    ]);
  });

  it('liefert Geometrie für bekannte Schlüssel und null sonst', () => {
    expect(getFrameGeometry('frame-01')?.openingWidth).toBe(657);
    expect(getFrameGeometry('frame-06')?.verticalOffset).toBe(-8);
    expect(getFrameGeometry('unbekannt')).toBeNull();
    expect(getFrameGeometry(null)).toBeNull();
  });

  it('wählt Retina-Assets groß genug für die Anzeigepixel', () => {
    expect(pickFrameAssetPx(104, 1)).toBe(128);
    expect(pickFrameAssetPx(244, 2)).toBe(480);
    expect(FRAME_ASSET_PX).toContain(480);
  });

  it('löst Asset-Pfad und srcSet für scharfe Darstellung auf', () => {
    expect(resolveFrameSrc('frame-09', 'lg', 2)).toBe('/brand/frames/frame-09-480.webp');
    expect(resolveFrameSrc('frame-02', 'sm', 1)).toBe('/brand/frames/frame-02-128.webp');
    expect(resolveFrameSrc(null)).toBeNull();
    expect(resolveFrameSrcSet('frame-09')).toContain('frame-09-480.webp 480w');
  });

  it('füllt den Avatar zu 85–90 % und hält den Rahmen ~10 % größer', () => {
    expect(AVATAR_FILL_RATIO).toBeGreaterThanOrEqual(0.85);
    expect(AVATAR_FILL_RATIO).toBeLessThanOrEqual(0.9);
    expect(FRAME_DISPLAY_PX.lg).toBeGreaterThanOrEqual(240);
    expect(HOLE_DISPLAY_SCALE).toBeGreaterThan(1);
    const layout = frameAvatarLayout('frame-09', 'lg');
    expect(layout.box).toBe(FRAME_DISPLAY_PX.lg);
    expect(layout.avatarPx / (layout.box * openingLayout(FRAME_GEOMETRY['frame-09']).holeRatio * HOLE_DISPLAY_SCALE)).toBeCloseTo(
      AVATAR_FILL_RATIO,
      1
    );
  });

  it('ordnet Sonderrahmen fest zu (08 Developer, 09 Super Admin, 10 Monat)', () => {
    expect(SPECIAL_FRAME.developer).toBe('frame-08');
    expect(SPECIAL_FRAME.super_admin).toBe('frame-09');
    expect(SPECIAL_FRAME.berater_des_monats).toBe('frame-10');
    expect(resolveDisplayFrameKey({ role: 'developer' })).toBe('frame-08');
  });
});
