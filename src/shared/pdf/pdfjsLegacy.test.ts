import { describe, expect, it } from 'vitest';
import { PDFJS_LEGACY_MODULE, PDFJS_LEGACY_WORKER_MODULE } from './pdfjsLegacy';

describe('pdfjsLegacy module paths (pdfjs-dist@6.1.200)', () => {
  it('points at legacy build + matching legacy worker only', () => {
    expect(PDFJS_LEGACY_MODULE).toBe('pdfjs-dist/legacy/build/pdf.mjs');
    expect(PDFJS_LEGACY_WORKER_MODULE).toBe('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    expect(PDFJS_LEGACY_MODULE).toContain('/legacy/');
    expect(PDFJS_LEGACY_WORKER_MODULE).toContain('/legacy/');
    expect(PDFJS_LEGACY_MODULE).not.toEqual('pdfjs-dist');
    expect(PDFJS_LEGACY_WORKER_MODULE).not.toContain('pdfjs-dist/build/pdf.worker.min');
  });
});
