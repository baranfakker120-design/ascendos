/**
 * Temporary REAL-DEVICE diagnostic for Knowledge PDF extraction (session only).
 * Captures WebKit/pdfjs failure metadata for UI disclosure — never PDF content,
 * filenames, tokens, or secrets. Not persisted to the database.
 */

import { isAppleMobileWebKit, type PdfWorkerMode } from '@shared/pdf/pdfRuntimeEnv';
import { hasPromiseTry, hasPromiseWithResolvers } from '@shared/pdf/promiseCompat';

export type PdfExtractStage =
  'init' | 'arrayBuffer' | 'loadPdfjs' | 'getDocument' | 'pageExtract' | 'unknown';

export interface PdfExtractRuntimeSnapshot {
  userAgent: string;
  platform: string;
  appleMobileWebKit: boolean;
  maxTouchPoints: number;
  hasPromiseWithResolvers: boolean;
  hasPromiseTry: boolean;
  typeofWorker: string;
  typeofFileArrayBuffer: string;
  typeofBlob: string;
  typeofUrlCreateObjectURL: string;
  typeofGlobalPdfjsWorker: string;
}

export interface PdfExtractPdfjsSnapshot {
  pdfjsVersion: string | null;
  workerMode: PdfWorkerMode | null;
  workerSrc: string | null;
  typeofGetDocument: string;
  withResolversPolyfilled: boolean | null;
  tryPolyfilled: boolean | null;
  selectedMode: string;
}

export interface PdfExtractErrorSnapshot {
  name: string;
  message: string;
  stack: string;
  toStringResult: string;
}

export interface PdfExtractDiagnosticReport {
  capturedAt: string;
  stage: PdfExtractStage;
  runtime: PdfExtractRuntimeSnapshot;
  pdfjs: PdfExtractPdfjsSnapshot;
  error: PdfExtractErrorSnapshot;
}

let lastReport: PdfExtractDiagnosticReport | null = null;

export function getLastPdfExtractDiagnostic(): PdfExtractDiagnosticReport | null {
  return lastReport;
}

export function clearLastPdfExtractDiagnostic(): void {
  lastReport = null;
}

export function setLastPdfExtractDiagnostic(report: PdfExtractDiagnosticReport): void {
  lastReport = report;
}

export function capturePdfExtractRuntimeSnapshot(
  nav:
    | Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>
    | null
    | undefined = typeof navigator !== 'undefined' ? navigator : undefined
): PdfExtractRuntimeSnapshot {
  const userAgent = nav?.userAgent ?? '';
  const maxTouchPoints = nav?.maxTouchPoints ?? 0;
  const g = globalThis as typeof globalThis & { pdfjsWorker?: unknown };
  return {
    userAgent,
    platform: nav?.platform ?? '',
    appleMobileWebKit: isAppleMobileWebKit({ userAgent, maxTouchPoints }),
    maxTouchPoints,
    hasPromiseWithResolvers: hasPromiseWithResolvers(),
    hasPromiseTry: hasPromiseTry(),
    typeofWorker: typeof Worker,
    typeofFileArrayBuffer:
      typeof File !== 'undefined' && File.prototype
        ? typeof File.prototype.arrayBuffer
        : 'unavailable',
    typeofBlob: typeof Blob,
    typeofUrlCreateObjectURL:
      typeof URL !== 'undefined' ? typeof URL.createObjectURL : 'unavailable',
    typeofGlobalPdfjsWorker: typeof g.pdfjsWorker,
  };
}

export function snapshotError(error: unknown): PdfExtractErrorSnapshot {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || '',
      stack: error.stack || '',
      toStringResult: (() => {
        try {
          return String(error);
        } catch {
          return 'Error';
        }
      })(),
    };
  }
  let toStringResult = 'unknown';
  try {
    toStringResult = String(error);
  } catch {
    toStringResult = 'unstringifiable';
  }
  return {
    name: typeof error,
    message: toStringResult.slice(0, 500),
    stack: '',
    toStringResult,
  };
}

export function buildPdfExtractDiagnosticReport(params: {
  stage: PdfExtractStage;
  runtime: PdfExtractRuntimeSnapshot;
  pdfjs?: Partial<PdfExtractPdfjsSnapshot>;
  error: unknown;
}): PdfExtractDiagnosticReport {
  return {
    capturedAt: new Date().toISOString(),
    stage: params.stage,
    runtime: params.runtime,
    pdfjs: {
      pdfjsVersion: params.pdfjs?.pdfjsVersion ?? null,
      workerMode: params.pdfjs?.workerMode ?? null,
      workerSrc: params.pdfjs?.workerSrc ?? null,
      typeofGetDocument: params.pdfjs?.typeofGetDocument ?? 'unknown',
      withResolversPolyfilled: params.pdfjs?.withResolversPolyfilled ?? null,
      tryPolyfilled: params.pdfjs?.tryPolyfilled ?? null,
      selectedMode: params.pdfjs?.selectedMode ?? 'pdfjs-dist/legacy',
    },
    error: snapshotError(params.error),
  };
}

/** Human-readable block for the "Technische Details" disclosure (session UI only). */
export function formatPdfExtractDiagnosticForUi(report: PdfExtractDiagnosticReport): string {
  const { error, runtime, pdfjs, stage, capturedAt } = report;
  return [
    `capturedAt: ${capturedAt}`,
    `stage: ${stage}`,
    '',
    'Error:',
    `  name: ${error.name}`,
    `  message: ${error.message}`,
    `  toString: ${error.toStringResult}`,
    '  stack:',
    error.stack ? error.stack : '  (none)',
    '',
    'PDF.js:',
    `  version: ${pdfjs.pdfjsVersion ?? '(n/a)'}`,
    `  selectedMode: ${pdfjs.selectedMode}`,
    `  typeof getDocument: ${pdfjs.typeofGetDocument}`,
    `  withResolversPolyfilled: ${String(pdfjs.withResolversPolyfilled)}`,
    `  tryPolyfilled: ${String(pdfjs.tryPolyfilled)}`,
    '',
    'Worker:',
    `  workerMode: ${pdfjs.workerMode ?? '(n/a)'}`,
    `  workerSrc: ${pdfjs.workerSrc ?? '(n/a)'}`,
    `  typeof globalThis.pdfjsWorker: ${runtime.typeofGlobalPdfjsWorker}`,
    `  typeof Worker: ${runtime.typeofWorker}`,
    '',
    'Runtime:',
    `  userAgent: ${runtime.userAgent}`,
    `  platform: ${runtime.platform}`,
    `  appleMobileWebKit: ${String(runtime.appleMobileWebKit)}`,
    `  maxTouchPoints: ${runtime.maxTouchPoints}`,
    `  Promise.withResolvers: ${runtime.hasPromiseWithResolvers ? 'function' : 'missing'}`,
    `  Promise.try: ${runtime.hasPromiseTry ? 'function' : 'missing'}`,
    `  File.arrayBuffer: ${runtime.typeofFileArrayBuffer}`,
    `  Blob: ${runtime.typeofBlob}`,
    `  URL.createObjectURL: ${runtime.typeofUrlCreateObjectURL}`,
  ].join('\n');
}
