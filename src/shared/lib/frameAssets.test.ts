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

  it('nutzt pixelvermessene Alpha-Öffnungen (kein Untermaß)', () => {
    expect(getFrameGeometry('frame-01')?.openingWidth).toBe(656);
    expect(getFrameGeometry('frame-09')?.openingWidth).toBe(590);
    expect(getFrameGeometry('frame-09')?.openingHeight).toBe(424);
    expect(getFrameGeometry('unbekannt')).toBeNull();
  });

  it('wählt Retina-Assets groß genug für die Anzeigepixel', () => {
    expect(pickFrameAssetPx(112, 1)).toBe(128);
    expect(pickFrameAssetPx(268, 2)).toBe(480);
    expect(FRAME_ASSET_PX).toContain(480);
  });

  it('löst Asset-Pfad und srcSet für scharfe Darstellung auf', () => {
    expect(resolveFrameSrc('frame-09', 'lg', 2)).toBe('/brand/frames/frame-09-480.webp');
    expect(resolveFrameSrc('frame-02', 'sm', 1)).toBe('/brand/frames/frame-02-128.webp');
    expect(resolveFrameSrc(null)).toBeNull();
    expect(resolveFrameSrcSet('frame-09')).toContain('frame-09-480.webp 480w');
  });

  it('füllt das Alpha-Loch vollständig — kein Spaltring zum Hintergrund', () => {
    expect(AVATAR_FILL_RATIO).toBe(1);
    expect(HOLE_DISPLAY_SCALE).toBeGreaterThanOrEqual(1.08);
    expect(FRAME_DISPLAY_PX.lg).toBeGreaterThanOrEqual(260);
    const layout = frameAvatarLayout('frame-09', 'lg');
    const hole = layout.box * openingLayout(FRAME_GEOMETRY['frame-09']).holeRatio;
    // Avatar >= Loch (Overlap unters Metall), kein Untermaß
    expect(layout.avatarPx).toBeGreaterThanOrEqual(Math.round(hole));
    expect(layout.avatarPx / hole).toBeCloseTo(HOLE_DISPLAY_SCALE, 2);
  });

  it('kennt xs für Chat-Avatare mit RankFrame', () => {
    expect(FRAME_DISPLAY_PX.xs).toBe(52);
    expect(resolveFrameSrc('frame-01', 'xs', 1)).toBe('/brand/frames/frame-01-96.webp');
    expect(frameAvatarLayout('frame-01', 'xs').box).toBe(52);
  });

  it('ordnet Sonderrahmen fest zu (08 Developer, 09 Super Admin, 10 Monat)', () => {
    expect(SPECIAL_FRAME.developer).toBe('frame-08');
    expect(SPECIAL_FRAME.super_admin).toBe('frame-09');
    expect(SPECIAL_FRAME.berater_des_monats).toBe('frame-10');
    expect(resolveDisplayFrameKey({ role: 'developer' })).toBe('frame-08');
  });
});
