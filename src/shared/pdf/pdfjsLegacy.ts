/**
 * pdfjs-dist legacy loader for iOS/Safari compatibility.
 *
 * Modern pdfjs builds call Promise.withResolvers() without a polyfill path that
 * older WebKit supports. The legacy build ships core-js polyfills (including
 * Promise.withResolvers) and must be paired with the matching legacy worker.
 */

/** Installed package: pdfjs-dist@6.1.200 — legacy ESM entry. */
export const PDFJS_LEGACY_MODULE = 'pdfjs-dist/legacy/build/pdf.mjs' as const;

/** Matching legacy worker asset (Vite ?url). */
export const PDFJS_LEGACY_WORKER_MODULE = 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url' as const;

export type PdfjsLegacyApi = typeof import('pdfjs-dist');

let pdfjsLegacyPromise: Promise<PdfjsLegacyApi> | null = null;

/**
 * Load pdfjs legacy + configure workerSrc once per session.
 * Never mix modern main build with legacy worker (or the reverse).
 */
export async function loadPdfjsLegacy(): Promise<PdfjsLegacyApi> {
  if (!pdfjsLegacyPromise) {
    pdfjsLegacyPromise = (async () => {
      // Paths match PDFJS_LEGACY_* constants (pdfjs-dist@6.1.200).
      const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as PdfjsLegacyApi;
      const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')) as {
        default: string;
      };
      if (!worker?.default) {
        throw new Error('pdfjs_legacy_worker_missing');
      }
      if (!pdfjs?.getDocument || !pdfjs.GlobalWorkerOptions) {
        throw new Error('pdfjs_legacy_api_missing');
      }
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  try {
    return await pdfjsLegacyPromise;
  } catch (e) {
    pdfjsLegacyPromise = null;
    throw e;
  }
}

/** Test helper — reset singleton between unit tests. */
export function resetPdfjsLegacyCacheForTests(): void {
  pdfjsLegacyPromise = null;
}
