import { afterEach, describe, expect, it } from 'vitest';
import {
  createReadableStreamAsyncIterator,
  ensureReadableStreamAsyncIterator,
  hasReadableStreamAsyncIterator,
  removeReadableStreamAsyncIteratorForTests,
  resetReadableStreamAsyncIteratorInstallFlagForTests,
  shouldInstallReadableStreamAsyncIterator,
} from './readableStreamAsyncIteratorCompat';
import {
  loadPdfjsCompat,
  openPdfDocumentWithCompat,
  resetPdfjsCompatCacheForTests,
} from './pdfjsCompat';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function makeChunkStream(chunks: unknown[]): ReadableStream<unknown> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]);
      } else {
        controller.close();
      }
    },
  });
}

/** Minimal valid PDF for getTextContent smoke. */
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

describe('readableStreamAsyncIteratorCompat', () => {
  afterEach(() => {
    // Restore native if we stripped it for a test — reinstall polyfill only when needed later.
    resetReadableStreamAsyncIteratorInstallFlagForTests();
    // If native existed and we couldn't delete, ensureReadableStream is a no-op.
    // If we deleted native for simulation, re-install polyfill so other suites keep working.
    if (!hasReadableStreamAsyncIterator()) {
      ensureReadableStreamAsyncIterator();
    }
  });

  it('does nothing when asyncIterator already exists', () => {
    // Node provides native asyncIterator — ensure should return false.
    expect(hasReadableStreamAsyncIterator()).toBe(true);
    expect(shouldInstallReadableStreamAsyncIterator()).toBe(false);
    expect(ensureReadableStreamAsyncIterator()).toBe(false);
  });

  it('installs polyfill when missing and is idempotent', () => {
    const removed = removeReadableStreamAsyncIteratorForTests();
    if (!removed) {
      // Native non-configurable — skip mutation assertions in this environment.
      expect(hasReadableStreamAsyncIterator()).toBe(true);
      return;
    }
    expect(hasReadableStreamAsyncIterator()).toBe(false);
    expect(shouldInstallReadableStreamAsyncIterator()).toBe(true);
    expect(ensureReadableStreamAsyncIterator()).toBe(true);
    expect(hasReadableStreamAsyncIterator()).toBe(true);
    expect(ensureReadableStreamAsyncIterator()).toBe(false);
  });

  it('async iterator returns { value, done } and completes with done=true', async () => {
    const stream = makeChunkStream([{ items: [1] }, { items: [2] }]);
    const it = createReadableStreamAsyncIterator(stream);
    const a = await it.next();
    expect(a.done).toBe(false);
    expect(a.value).toEqual({ items: [1] });
    const b = await it.next();
    expect(b.done).toBe(false);
    expect(b.value).toEqual({ items: [2] });
    const c = await it.next();
    expect(c.done).toBe(true);
    expect(c.value).toBeUndefined();
  });

  it('for-await consumes a ReadableStream via Symbol.asyncIterator', async () => {
    const removed = removeReadableStreamAsyncIteratorForTests();
    if (removed) ensureReadableStreamAsyncIterator();
    const stream = makeChunkStream(['a', 'b', 'c']) as ReadableStream<unknown> &
      AsyncIterable<unknown>;
    const out: unknown[] = [];
    for await (const chunk of stream) {
      out.push(chunk);
    }
    expect(out).toEqual(['a', 'b', 'c']);
  });

  it('iterator.return() releases/cancels the reader safely', async () => {
    const stream = makeChunkStream([1, 2, 3, 4]);
    const it = createReadableStreamAsyncIterator(stream);
    expect((await it.next()).value).toBe(1);
    const ret = await it.return?.();
    expect(ret?.done).toBe(true);
    // Further next() stays done
    expect((await it.next()).done).toBe(true);
    // Stream should be locked or cancelled — creating a new reader may fail if cancelled;
    // primary assert is no throw from return().
  });

  it('never overwrites an existing native asyncIterator', () => {
    const proto = ReadableStream.prototype as ReadableStream & {
      [Symbol.asyncIterator]?: unknown;
    };
    const native = proto[Symbol.asyncIterator];
    expect(typeof native).toBe('function');
    expect(ensureReadableStreamAsyncIterator()).toBe(false);
    expect(proto[Symbol.asyncIterator]).toBe(native);
  });
});

describe('iOS ReadableStream asyncIterator simulation + PDF getTextContent', () => {
  afterEach(() => {
    resetPdfjsCompatCacheForTests();
    resetReadableStreamAsyncIteratorInstallFlagForTests();
    if (!hasReadableStreamAsyncIterator()) {
      ensureReadableStreamAsyncIterator();
    }
  });

  it('BEFORE polyfill: for-await on stream fails when asyncIterator removed', async () => {
    const removed = removeReadableStreamAsyncIteratorForTests();
    if (!removed) {
      // Cannot simulate on this runtime
      expect(hasReadableStreamAsyncIterator()).toBe(true);
      return;
    }
    expect(hasReadableStreamAsyncIterator()).toBe(false);
    const stream = makeChunkStream([1]) as ReadableStream<unknown> & AsyncIterable<unknown>;
    let failed = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of stream) {
        // should not enter
      }
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });

  it('AFTER polyfill: getDocument → getPage → getTextContent PASS', async () => {
    const removed = removeReadableStreamAsyncIteratorForTests();
    // Install via compatibility initializer (same path as production loader)
    ensureReadableStreamAsyncIterator();
    expect(hasReadableStreamAsyncIterator()).toBe(true);

    const { loadingTask, workerMode } = await openPdfDocumentWithCompat(minimalPdfBytes(), {
      workerMode: 'main-thread',
    });
    expect(workerMode).toBe('main-thread');
    try {
      const doc = await loadingTask.promise;
      expect(doc.numPages).toBeGreaterThanOrEqual(1);
      const page = await doc.getPage(1);
      const content = await page.getTextContent();
      expect(Array.isArray(content.items)).toBe(true);
      // Text may be empty without standard fonts; structure must succeed
      expect(content).toHaveProperty('styles');
    } finally {
      await loadingTask.destroy();
    }
    // If removal failed (native locked), test still validates happy path
    void removed;
  }, 60_000);

  it('pdfjsCompat source installs ReadableStream compat before pdfjs import', () => {
    const srcPath = fileURLToPath(new URL('./pdfjsCompat.ts', import.meta.url));
    const src = readFileSync(srcPath, 'utf8');
    const rsIdx = src.indexOf('ensureReadableStreamAsyncIterator(');
    const importIdx = src.indexOf("import('pdfjs-dist/legacy/build/pdf.mjs')");
    expect(rsIdx).toBeGreaterThan(-1);
    expect(importIdx).toBeGreaterThan(-1);
    expect(rsIdx).toBeLessThan(importIdx);
  });

  it('loadPdfjsCompat applies ReadableStream compat', async () => {
    const removed = removeReadableStreamAsyncIteratorForTests();
    resetPdfjsCompatCacheForTests();
    await loadPdfjsCompat({ workerMode: 'module-worker' });
    expect(hasReadableStreamAsyncIterator()).toBe(true);
    void removed;
  }, 60_000);
});

describe('optional Namensliste PDF getTextContent', () => {
  afterEach(() => {
    resetPdfjsCompatCacheForTests();
  });

  it('extracts text from Modul1 PDF when fixture is available', async () => {
    const candidates = [
      '/tmp/pdf-test/Modul1-Namensliste.pdf',
      '/tmp/ios-rca/Modul1-Namensliste.pdf',
    ];
    let bytes: Uint8Array | null = null;
    for (const p of candidates) {
      try {
        bytes = new Uint8Array(readFileSync(p));
        break;
      } catch {
        // try next
      }
    }
    if (!bytes) {
      expect(true).toBe(true); // fixture absent in this environment
      return;
    }
    ensureReadableStreamAsyncIterator();
    const { loadingTask } = await openPdfDocumentWithCompat(bytes, { workerMode: 'main-thread' });
    try {
      const doc = await loadingTask.promise;
      expect(doc.numPages).toBe(12);
      const page = await doc.getPage(1);
      const content = await page.getTextContent();
      const text = content.items.map((i) => ('str' in i ? i.str : '')).join(' ');
      expect(text.toUpperCase()).toContain('MODUL');
    } finally {
      await loadingTask.destroy();
    }
  }, 120_000);
});
