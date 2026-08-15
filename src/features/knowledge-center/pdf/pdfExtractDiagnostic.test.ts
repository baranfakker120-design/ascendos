import { describe, expect, it } from 'vitest';
import {
  buildPdfExtractDiagnosticReport,
  capturePdfExtractRuntimeSnapshot,
  clearLastPdfExtractDiagnostic,
  formatPdfExtractDiagnosticForUi,
  getLastPdfExtractDiagnostic,
  setLastPdfExtractDiagnostic,
  snapshotError,
} from './pdfExtractDiagnostic';
import { buildKnowledgePdfExtractionFailureUpdate } from './pipelineStatus';

describe('pdfExtractDiagnostic (session-only)', () => {
  it('snapshots Error name/message/stack/toString without content fields', () => {
    const err = new Error("undefined is not a function (near '...i of t...')");
    err.name = 'TypeError';
    const snap = snapshotError(err);
    expect(snap.name).toBe('TypeError');
    expect(snap.message).toContain('undefined is not a function');
    expect(snap.toStringResult).toContain('TypeError');
    expect(snap.stack).toContain('TypeError');
  });

  it('builds a report with runtime + pdfjs metadata and formats for UI', () => {
    const runtime = capturePdfExtractRuntimeSnapshot({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15',
      platform: 'iPhone',
      maxTouchPoints: 5,
    });
    expect(runtime.appleMobileWebKit).toBe(true);
    expect(typeof runtime.hasPromiseWithResolvers).toBe('boolean');
    expect(typeof runtime.hasPromiseTry).toBe('boolean');

    const report = buildPdfExtractDiagnosticReport({
      stage: 'getDocument',
      runtime,
      pdfjs: {
        pdfjsVersion: '6.1.200',
        workerMode: 'main-thread',
        workerSrc: '/assets/pdf.worker.min-fake.mjs',
        typeofGetDocument: 'function',
        withResolversPolyfilled: true,
        tryPolyfilled: true,
        selectedMode: 'pdfjs-dist/legacy',
      },
      error: new TypeError("undefined is not a function (near '...i of t...')"),
    });

    const text = formatPdfExtractDiagnosticForUi(report);
    expect(text).toContain('stage: getDocument');
    expect(text).toContain('workerMode: main-thread');
    expect(text).toContain('appleMobileWebKit: true');
    expect(text).toContain('undefined is not a function');
    // No PDF payload / no secrets
    expect(text).not.toMatch(/filename|storage_path|Bearer |apikey|password/i);

    clearLastPdfExtractDiagnostic();
    setLastPdfExtractDiagnostic(report);
    expect(getLastPdfExtractDiagnostic()?.stage).toBe('getDocument');
    clearLastPdfExtractDiagnostic();
    expect(getLastPdfExtractDiagnostic()).toBeNull();
  });

  it('failed-status DB update still uses user-facing message only', () => {
    const err = new TypeError("undefined is not a function (near '...i of t...')");
    const update = buildKnowledgePdfExtractionFailureUpdate(err, null);
    expect(update.status).toBe('failed');
    expect(update.error_message).not.toContain('stack');
    expect(update.error_message).not.toContain('userAgent');
    expect(update.error_message.length).toBeLessThanOrEqual(500);
  });
});
