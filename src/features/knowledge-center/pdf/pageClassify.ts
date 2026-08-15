/**
 * Knowledge PDF page classification + cost gate (pure, unit-tested).
 * Vision only for SCANNED / MIXED / IMAGE_HEAVY — never for pure TEXT.
 */

export type KnowledgePdfPageType = 'TEXT' | 'SCANNED' | 'MIXED' | 'IMAGE_HEAVY';

export interface PageSignals {
  /** Extractable text-layer length (characters). */
  textLength: number;
  /** Approx image operators / embedded images detected on the page. */
  imageCount: number;
  /** Optional: page has rendered bitmap area (always true after canvas render). */
  hasRender?: boolean;
}

/** Heuristic thresholds — tuned for cost control, not pixel-perfect layout. */
export const TEXT_MIN_CHARS = 80;
export const IMAGE_HEAVY_MIN_IMAGES = 2;

export function classifyKnowledgePdfPage(signals: PageSignals): KnowledgePdfPageType {
  const text = Math.max(0, signals.textLength);
  const images = Math.max(0, signals.imageCount);
  const hasText = text >= TEXT_MIN_CHARS;
  const hasImages = images > 0;

  if (!hasText && hasImages) {
    return images >= IMAGE_HEAVY_MIN_IMAGES ? 'IMAGE_HEAVY' : 'SCANNED';
  }
  if (!hasText && !hasImages) {
    return 'SCANNED';
  }
  if (hasText && hasImages) {
    return images >= IMAGE_HEAVY_MIN_IMAGES ? 'IMAGE_HEAVY' : 'MIXED';
  }
  return 'TEXT';
}

/** Cost gate: only pages that need vision consume OpenRouter. */
export function pageNeedsVision(pageType: KnowledgePdfPageType): boolean {
  return pageType === 'SCANNED' || pageType === 'MIXED' || pageType === 'IMAGE_HEAVY';
}

export function countVisionPages(pageTypes: KnowledgePdfPageType[]): number {
  return pageTypes.filter(pageNeedsVision).length;
}

export function assertTextPdfZeroVision(pageTypes: KnowledgePdfPageType[]): boolean {
  return pageTypes.every((t) => t === 'TEXT') && countVisionPages(pageTypes) === 0;
}
