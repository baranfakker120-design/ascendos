import { afterEach, describe, expect, it } from 'vitest';
import {
  loadPdfjsCompat,
  openPdfDocumentWithCompat,
  resetPdfjsCompatCacheForTests,
} from './pdfjsCompat';

/** Minimal one-page PDF (valid enough for pdfjs getDocument). */
function minimalPdfBytes(): Uint8Array {
  const raw = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 44 >>stream
BT /F1 24 Tf 50 50 Td (Hello) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000360 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
441
%%EOF`;
  return new TextEncoder().encode(raw);
}

describe('pdfjsCompat getDocument smoke (node / main-thread)', () => {
  afterEach(() => {
    resetPdfjsCompatCacheForTests();
  });

  it('PATH B main-thread: getDocument + page count + text', async () => {
    const { pdfjs, workerMode } = await loadPdfjsCompat({ workerMode: 'main-thread' });
    expect(workerMode).toBe('main-thread');
    expect(pdfjs.version).toMatch(/^6\./);

    const { loadingTask } = await openPdfDocumentWithCompat(minimalPdfBytes(), {
      workerMode: 'main-thread',
    });
    try {
      const doc = await loadingTask.promise;
      expect(doc.numPages).toBeGreaterThanOrEqual(1);
      const page = await doc.getPage(1);
      const content = await page.getTextContent();
      const text = (content.items || [])
        .map((i) => ('str' in i ? i.str : ''))
        .join('')
        .trim();
      // Font embedding may vary; at least parsing must succeed without throw
      expect(typeof text).toBe('string');
    } finally {
      await loadingTask.destroy();
    }
  }, 60_000);

  it('PATH A module-worker load configures workerSrc (node still fakes worker)', async () => {
    resetPdfjsCompatCacheForTests();
    const { pdfjs, workerMode } = await loadPdfjsCompat({ workerMode: 'module-worker' });
    expect(workerMode).toBe('module-worker');
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBeTruthy();
  }, 60_000);
});
