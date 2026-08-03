import { describe, expect, it } from 'vitest';
import { resolveFrameSrc } from '@shared/lib/frameAssets';

/**
 * RankChip selbst ist rein deklarativ; die einzige auflösbare Logik
 * ist der Mini-Frame-Pfad — derselbe Vertrag wie RankFrame (sm = 96).
 */
describe('RankChip frame path contract', () => {
  it('nutzt sm-Frame-Pfad für framed-Variante', () => {
    expect(resolveFrameSrc('frame-01', 'sm')).toBe('/brand/frames/frame-01-128.webp');
  });

  it('liefert null ohne frameKey', () => {
    expect(resolveFrameSrc(null, 'sm')).toBeNull();
  });
});
