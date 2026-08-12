/**
 * Optional FaceDetector positioning for Live Coaching flyer glows.
 * Never mutates the source image — returns normalized boxes only.
 */

export interface FlyerGlowRegion {
  /** Percent of container (0–100), object-fit: contain mapped. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** 0–1 relative pulse strength */
  intensity: number;
}

export interface ContainBox {
  containerW: number;
  containerH: number;
  imageW: number;
  imageH: number;
}

type CacheEntry = { regions: FlyerGlowRegion[]; source: 'faces' | 'fallback' };

const cache = new Map<string, CacheEntry>();

interface FaceDetectorBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FaceDetectorResult {
  boundingBox: FaceDetectorBoundingBox;
}

interface FaceDetectorLike {
  detect(image: ImageBitmapSource): Promise<FaceDetectorResult[]>;
}

interface FaceDetectorConstructor {
  new (options?: { maxDetectedFaces?: number; fastMode?: boolean }): FaceDetectorLike;
}

declare global {
  interface Window {
    FaceDetector?: FaceDetectorConstructor;
  }
}

/** Soft cinematic spots when FaceDetector is unavailable (typical 9:16 portrait). */
export function fallbackFlyerGlowRegions(): FlyerGlowRegion[] {
  return [
    { left: 18, top: 14, width: 38, height: 28, intensity: 0.85 },
    { left: 48, top: 18, width: 34, height: 26, intensity: 0.7 },
    { left: 28, top: 42, width: 44, height: 22, intensity: 0.45 },
  ];
}

/**
 * Map a natural-image face box into container % for object-fit: contain.
 */
export function mapContainBoxToPercent(
  box: { x: number; y: number; width: number; height: number },
  layout: ContainBox
): FlyerGlowRegion | null {
  const { containerW, containerH, imageW, imageH } = layout;
  if (containerW <= 0 || containerH <= 0 || imageW <= 0 || imageH <= 0) return null;
  const scale = Math.min(containerW / imageW, containerH / imageH);
  const dispW = imageW * scale;
  const dispH = imageH * scale;
  const offsetX = (containerW - dispW) / 2;
  const offsetY = (containerH - dispH) / 2;
  // Expand slightly so glow wraps the person, not a tight face crop.
  const padX = box.width * 0.35;
  const padY = box.height * 0.45;
  const leftPx = offsetX + (box.x - padX) * scale;
  const topPx = offsetY + (box.y - padY) * scale;
  const widthPx = (box.width + padX * 2) * scale;
  const heightPx = (box.height + padY * 2) * scale;
  return {
    left: (leftPx / containerW) * 100,
    top: (topPx / containerH) * 100,
    width: (widthPx / containerW) * 100,
    height: (heightPx / containerH) * 100,
    intensity: 0.8,
  };
}

function faceDetectorAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.FaceDetector === 'function';
}

/**
 * Detect face regions once per media URL. Caches results.
 * On any failure → cinematic fallback (never throws to UI).
 */
export async function resolveFlyerGlowRegions(
  mediaUrl: string,
  img: HTMLImageElement,
  container: HTMLElement
): Promise<CacheEntry> {
  const cached = cache.get(mediaUrl);
  if (cached) return cached;

  const layout: ContainBox = {
    containerW: container.clientWidth,
    containerH: container.clientHeight,
    imageW: img.naturalWidth,
    imageH: img.naturalHeight,
  };

  const cacheFallback = (): CacheEntry => {
    const entry: CacheEntry = { regions: fallbackFlyerGlowRegions(), source: 'fallback' };
    cache.set(mediaUrl, entry);
    return entry;
  };

  if (!faceDetectorAvailable() || layout.imageW <= 0) {
    return cacheFallback();
  }

  try {
    const detector = new window.FaceDetector!({ maxDetectedFaces: 6, fastMode: true });
    const faces = await detector.detect(img);
    if (!faces.length) return cacheFallback();

    const regions = faces
      .map((face, i) => {
        const b = face.boundingBox;
        const mapped = mapContainBoxToPercent(
          { x: b.x, y: b.y, width: b.width, height: b.height },
          layout
        );
        if (!mapped) return null;
        mapped.intensity = 0.65 + (i % 3) * 0.1;
        return mapped;
      })
      .filter((r): r is FlyerGlowRegion => r != null);

    if (!regions.length) return cacheFallback();

    const entry: CacheEntry = { regions, source: 'faces' };
    cache.set(mediaUrl, entry);
    return entry;
  } catch {
    return cacheFallback();
  }
}

/** Test helper — clears detection cache. */
export function clearFlyerFaceCache(): void {
  cache.clear();
}
