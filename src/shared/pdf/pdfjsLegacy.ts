/**
 * pdfjs-dist@6.1.200 legacy path constants (no runtime loader here).
 * Runtime loading goes through `@shared/pdf/pdfjsCompat` so Promise shims
 * run before any pdfjs module evaluation.
 */

/** Legacy ESM API entry. */
export const PDFJS_LEGACY_MODULE = 'pdfjs-dist/legacy/build/pdf.mjs' as const;

/** Matching legacy worker asset (Vite ?url) for GlobalWorkerOptions.workerSrc. */
export const PDFJS_LEGACY_WORKER_MODULE = 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url' as const;

/** Matching legacy worker ESM entry (main-thread / fake-worker import). */
export const PDFJS_LEGACY_WORKER_ENTRY = 'pdfjs-dist/legacy/build/pdf.worker.min.mjs' as const;

export type PdfjsLegacyApi = typeof import('pdfjs-dist');
