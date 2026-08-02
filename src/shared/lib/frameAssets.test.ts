import { describe, expect, it } from 'vitest';
import {
  FRAME_GEOMETRY,
  getFrameGeometry,
  openingLayout,
  resolveFrameSrc,
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

  it('löst den späteren öffentlichen Asset-Pfad auf ohne Dateien auszuliefern', () => {
    expect(resolveFrameSrc('frame-01', 'lg')).toBe('/brand/frames/frame-01-160.webp');
    expect(resolveFrameSrc('frame-02', 'sm')).toBe('/brand/frames/frame-02-96.webp');
    expect(resolveFrameSrc(null)).toBeNull();
  });

  it('rechnet Öffnungsanteile relativ zur Quellbreite', () => {
    const layout = openingLayout(FRAME_GEOMETRY['frame-01']);
    expect(layout.widthRatio).toBeCloseTo(657 / 1024, 5);
    expect(layout.offsetYRatio).toBeCloseTo(-34 / 1024, 5);
  });
});
