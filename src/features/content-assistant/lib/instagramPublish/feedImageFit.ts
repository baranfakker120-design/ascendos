/**
 * Client mirror of Edge feed-image fit helpers (Meta Content Publishing).
 */

export const IG_FEED_IMAGE_SPECS = {
  minAspectRatio: 4 / 5,
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

export function computeFeedImageCrop(width: number, height: number): FeedImageCropRect {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const ratio = w / h;
  const { minAspectRatio, maxAspectRatio } = IG_FEED_IMAGE_SPECS;

  if (ratio < minAspectRatio) {
    const cropH = Math.max(1, Math.floor(w / minAspectRatio));
    const y = Math.max(0, Math.floor((h - cropH) / 2));
    return { x: 0, y, width: w, height: Math.min(cropH, h - y) };
  }

  if (ratio > maxAspectRatio) {
    const cropW = Math.max(1, Math.floor(h * maxAspectRatio));
    const x = Math.max(0, Math.floor((w - cropW) / 2));
    return { x, y: 0, width: Math.min(cropW, w - x), height: h };
  }

  return { x: 0, y: 0, width: w, height: h };
}

export function feedImageEncodeWidth(croppedWidth: number): number {
  const w = Math.max(1, Math.floor(croppedWidth));
  if (w < IG_FEED_IMAGE_SPECS.minWidthPx) return IG_FEED_IMAGE_SPECS.minWidthPx;
  return Math.min(IG_FEED_IMAGE_SPECS.maxWidthPx, w);
}

export function isMetaFeedImageAspectError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('aspect ratio') ||
    m.includes('seitenverhältnis') ||
    m.includes('2207009') ||
    (m.includes('valid aspect') && m.includes('image'))
  );
}
