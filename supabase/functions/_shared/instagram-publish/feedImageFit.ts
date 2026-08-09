/**
 * Instagram Content Publishing — feed image aspect fit (official Meta range).
 * Docs: JPEG; aspect ratio within 4:5 … 1.91:1; width 320–1440.
 */

export const IG_FEED_IMAGE_SPECS = {
  /** Tallest allowed: 4:5 */
  minAspectRatio: 4 / 5,
  /** Widest allowed: 1.91:1 */
  maxAspectRatio: 1.91,
  minWidthPx: 320,
  maxWidthPx: 1440,
} as const;

export type FeedImageCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** True when width/height already fall inside Meta's feed aspect window. */
export function isFeedImageAspectAllowed(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false;
  }
  const ratio = width / height;
  return (
    ratio + 1e-9 >= IG_FEED_IMAGE_SPECS.minAspectRatio &&
    ratio - 1e-9 <= IG_FEED_IMAGE_SPECS.maxAspectRatio
  );
}

/**
 * Center-crop rectangle so the result ratio is within Meta's feed window.
 * If already valid, returns the full frame.
 */
export function computeFeedImageCrop(width: number, height: number): FeedImageCropRect {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const ratio = w / h;
  const { minAspectRatio, maxAspectRatio } = IG_FEED_IMAGE_SPECS;

  if (ratio < minAspectRatio) {
    // Too tall → crop height (keep width).
    const cropH = Math.max(1, Math.floor(w / minAspectRatio));
    const y = Math.max(0, Math.floor((h - cropH) / 2));
    return { x: 0, y, width: w, height: Math.min(cropH, h - y) };
  }

  if (ratio > maxAspectRatio) {
    // Too wide → crop width (keep height).
    const cropW = Math.max(1, Math.floor(h * maxAspectRatio));
    const x = Math.max(0, Math.floor((w - cropW) / 2));
    return { x, y: 0, width: Math.min(cropW, w - x), height: h };
  }

  return { x: 0, y: 0, width: w, height: h };
}

/** Target encode width after crop (Meta 320–1440; upscale tiny, downscale huge). */
export function feedImageEncodeWidth(croppedWidth: number): number {
  const w = Math.max(1, Math.floor(croppedWidth));
  if (w < IG_FEED_IMAGE_SPECS.minWidthPx) return IG_FEED_IMAGE_SPECS.minWidthPx;
  return Math.min(IG_FEED_IMAGE_SPECS.maxWidthPx, w);
}

/** Detect Meta error 2207009 / aspect-ratio rejection in sanitized messages. */
export function isMetaFeedImageAspectError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('aspect ratio') ||
    m.includes('seitenverhältnis') ||
    m.includes('2207009') ||
    (m.includes('valid aspect') && m.includes('image'))
  );
}

export const FEED_IMAGE_ASPECT_ERROR_MESSAGE =
  'Feed-Bilder brauchen ein Seitenverhältnis zwischen 4:5 und 1,91:1 (Instagram/Meta). Das Bild wurde angepasst bzw. bitte ein anderes Format wählen.';
