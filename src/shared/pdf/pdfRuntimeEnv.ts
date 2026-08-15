/**
 * Runtime detection for PDF.js worker strategy.
 * iOS/WebKit is the only environment that prefers main-thread (fake) worker.
 */

export type PdfWorkerMode = 'module-worker' | 'main-thread';

export interface PdfRuntimeHints {
  userAgent: string;
  maxTouchPoints?: number;
}

/**
 * Detect Apple mobile WebKit (iPhone/iPad/iPod) including iPadOS desktop UA.
 * Desktop Safari/Chrome/Firefox must return false.
 */
export function isAppleMobileWebKit(hints: PdfRuntimeHints): boolean {
  const ua = hints.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ may report as Macintosh + touch
  if (/Macintosh/i.test(ua) && (hints.maxTouchPoints ?? 0) > 1) return true;
  return false;
}

/**
 * PATH A: module-worker (desktop default)
 * PATH B: main-thread fake worker (iOS preference — avoids module Worker realm issues)
 */
export function resolvePdfWorkerMode(hints: PdfRuntimeHints): PdfWorkerMode {
  return isAppleMobileWebKit(hints) ? 'main-thread' : 'module-worker';
}

/** Browser helper using current navigator when available. */
export function resolvePdfWorkerModeFromNavigator(
  nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> | null | undefined = typeof navigator !==
  'undefined'
    ? navigator
    : undefined
): PdfWorkerMode {
  if (!nav) return 'module-worker';
  return resolvePdfWorkerMode({
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints,
  });
}
