/**
 * Pure pinch/pan helpers — kept free of React so gesture math stays testable.
 */

export type CameraXYS = { x: number; y: number; scale: number };

export function clampScale(scale: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, scale));
}

/** Zoom around a focal point in viewport coordinates (origin = stage top-left). */
export function zoomCameraAt(
  camera: CameraXYS,
  focalX: number,
  focalY: number,
  factor: number,
  minScale: number,
  maxScale: number
): CameraXYS {
  const nextScale = clampScale(camera.scale * factor, minScale, maxScale);
  if (nextScale === camera.scale && factor !== 1) {
    return camera;
  }
  const wx = (focalX - camera.x) / camera.scale;
  const wy = (focalY - camera.y) / camera.scale;
  return {
    scale: nextScale,
    x: focalX - wx * nextScale,
    y: focalY - wy * nextScale,
  };
}

export function panCamera(camera: CameraXYS, dx: number, dy: number): CameraXYS {
  return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

export function dist2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(
  a: { x: number; y: number },
  b: { x: number; y: number }
): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
