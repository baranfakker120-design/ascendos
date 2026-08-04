import { describe, expect, it } from 'vitest';
import { panCamera, zoomCameraAt } from './cameraMath';

describe('cameraMath', () => {
  it('pans without changing scale', () => {
    const next = panCamera({ x: 10, y: 20, scale: 1.4 }, 5, -3);
    expect(next).toEqual({ x: 15, y: 17, scale: 1.4 });
  });

  it('zooms around focal point and keeps the world point stable under the focus', () => {
    const cam = { x: 100, y: 50, scale: 1 };
    const focal = { x: 200, y: 150 };
    const worldX = (focal.x - cam.x) / cam.scale;
    const worldY = (focal.y - cam.y) / cam.scale;

    const next = zoomCameraAt(cam, focal.x, focal.y, 1.5, 0.35, 1.85);
    expect(next.scale).toBe(1.5);
    // Same world point stays under the focal pixel
    expect(focal.x - worldX * next.scale).toBeCloseTo(next.x, 6);
    expect(focal.y - worldY * next.scale).toBeCloseTo(next.y, 6);
  });

  it('does not reset translation when zoom factor is 1', () => {
    const cam = { x: 40, y: -12, scale: 0.82 };
    const next = zoomCameraAt(cam, 10, 10, 1, 0.35, 1.85);
    expect(next.x).toBe(cam.x);
    expect(next.y).toBe(cam.y);
    expect(next.scale).toBe(cam.scale);
  });
});
