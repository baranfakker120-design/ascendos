/**
 * PDF.js compatibility layer (V2).
 *
 * Order is mandatory:
 * 1) ensurePdfPromiseCompat() — before any pdfjs evaluation
 * 2) dynamic import of legacy pdf.mjs + worker URL
 * 3) iOS → preload worker into globalThis.pdfjsWorker (main-thread / fake worker)
 *    Desktop → module Worker via GlobalWorkerOptions.workerSrc
 *
 * Never statically import pdfjs-dist at module top-level from this file.
 */

import {
  PDFJS_LEGACY_MODULE,
  PDFJS_LEGACY_WORKER_ENTRY,
  PDFJS_LEGACY_WORKER_MODULE,
  type PdfjsLegacyApi,
} from './pdfjsLegacy';
import { ensurePdfPromiseCompat } from './promiseCompat';
import { ensureReadableStreamAsyncIterator } from './readableStreamAsyncIteratorCompat';
import { resolvePdfWorkerModeFromNavigator, type PdfWorkerMode } from './pdfRuntimeEnv';

export type { PdfWorkerMode, PdfjsLegacyApi };
export { PDFJS_LEGACY_MODULE, PDFJS_LEGACY_WORKER_MODULE, PDFJS_LEGACY_WORKER_ENTRY };
export { resolvePdfWorkerMode, isAppleMobileWebKit } from './pdfRuntimeEnv';
export {
  ensurePdfPromiseCompat,
  ensurePromiseWithResolvers,
  ensurePromiseTry,
  hasPromiseWithResolvers,
  hasPromiseTry,
} from './promiseCompat';
export {
  ensureReadableStreamAsyncIterator,
  hasReadableStreamAsyncIterator,
  shouldInstallReadableStreamAsyncIterator,
} from './readableStreamAsyncIteratorCompat';

export interface PdfjsCompatLoadResult {
  pdfjs: PdfjsLegacyApi;
  workerMode: PdfWorkerMode;
  withResolversPolyfilled: boolean;
  tryPolyfilled: boolean;
}

type PdfjsWorkerModule = {
  WorkerMessageHandler?: unknown;
  default?: { WorkerMessageHandler?: unknown };
};

let pdfjsCompatPromise: Promise<PdfjsCompatLoadResult> | null = null;

/** Test/observability: last resolved worker mode (null until first load). */
let lastWorkerMode: PdfWorkerMode | null = null;

export function getLastPdfjsWorkerModeForTests(): PdfWorkerMode | null {
  return lastWorkerMode;
}

/**
 * Force main-thread worker by exposing WorkerMessageHandler on globalThis
 * before PDFWorker initializes (pdfjs checks globalThis.pdfjsWorker).
 */
export function installPdfjsMainThreadWorker(handler: unknown): void {
  const g = globalThis as typeof globalThis & {
    pdfjsWorker?: { WorkerMessageHandler?: unknown };
  };
  g.pdfjsWorker = { WorkerMessageHandler: handler };
}

export function clearPdfjsMainThreadWorkerForTests(): void {
  const g = globalThis as typeof globalThis & { pdfjsWorker?: unknown };
  try {
    delete g.pdfjsWorker;
  } catch {
    g.pdfjsWorker = undefined;
  }
}

function readWorkerMessageHandler(mod: PdfjsWorkerModule): unknown {
  return mod.WorkerMessageHandler ?? mod.default?.WorkerMessageHandler ?? null;
}

/**
 * Load legacy pdfjs with Promise shims applied first.
 * @param workerModeOverride — tests only; production uses navigator heuristics.
 */
export async function loadPdfjsCompat(options?: {
  workerMode?: PdfWorkerMode;
}): Promise<PdfjsCompatLoadResult> {
  if (!pdfjsCompatPromise) {
    const forcedMode = options?.workerMode;
    pdfjsCompatPromise = (async () => {
      // 1) Compat shims BEFORE dynamic pdfjs import/evaluation.
      //    ReadableStream async-iterator is required for getTextContent()'s
      //    `for await (... of streamTextContent())` on Safari/WebKit.
      const poly = ensurePdfPromiseCompat();
      ensureReadableStreamAsyncIterator();

      // 2) Dynamic imports only (no static pdfjs side effects above).
      const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as PdfjsLegacyApi;
      const workerUrlMod = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')) as {
        default: string;
      };
      if (!workerUrlMod?.default) {
        throw new Error('pdfjs_legacy_worker_missing');
      }
      if (!pdfjs?.getDocument || !pdfjs.GlobalWorkerOptions) {
        throw new Error('pdfjs_legacy_api_missing');
      }

      pdfjs.GlobalWorkerOptions.workerSrc = workerUrlMod.default;

      const workerMode = forcedMode ?? resolvePdfWorkerModeFromNavigator();

      // 3) PATH B (iOS): preload worker module into main thread so pdfjs
      // skips `new Worker(..., { type: "module" })` and uses fake worker.
      if (workerMode === 'main-thread') {
        // Must match PDFJS_LEGACY_WORKER_ENTRY (literal required for Vite).
        const workerMod =
          (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs')) as PdfjsWorkerModule;
        const handler = readWorkerMessageHandler(workerMod);
        if (!handler) {
          throw new Error('pdfjs_legacy_worker_handler_missing');
        }
        installPdfjsMainThreadWorker(handler);
      }

      lastWorkerMode = workerMode;
      return {
        pdfjs,
        workerMode,
        withResolversPolyfilled: poly.withResolversPolyfilled,
        tryPolyfilled: poly.tryPolyfilled,
      };
    })();
  }

  try {
    const result = await pdfjsCompatPromise;
    // If a later caller forces a different mode after first load, ignore —
    // singleton is intentional (one pdfjs config per page session).
    return result;
  } catch (e) {
    pdfjsCompatPromise = null;
    lastWorkerMode = null;
    throw e;
  }
}

/** Convenience: return only the pdfjs API (compat layer still runs). */
export async function loadPdfjsLegacy(): Promise<PdfjsLegacyApi> {
  const { pdfjs } = await loadPdfjsCompat();
  return pdfjs;
}

/** Open a PDF via the compatibility layer (shared by Knowledge extract paths). */
export async function openPdfDocumentWithCompat(
  data: Uint8Array | ArrayBuffer,
  options?: { workerMode?: PdfWorkerMode }
): Promise<{
  pdfjs: PdfjsLegacyApi;
  loadingTask: ReturnType<PdfjsLegacyApi['getDocument']>;
  workerMode: PdfWorkerMode;
}> {
  const { pdfjs, workerMode } = await loadPdfjsCompat(options);
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const loadingTask = pdfjs.getDocument({ data: bytes });
  return { pdfjs, loadingTask, workerMode };
}

/** Test helper — reset singleton between unit tests. */
export function resetPdfjsCompatCacheForTests(): void {
  pdfjsCompatPromise = null;
  lastWorkerMode = null;
  clearPdfjsMainThreadWorkerForTests();
}
