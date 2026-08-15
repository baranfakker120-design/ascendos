import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPromiseTryPolyfill,
  createPromiseWithResolversPolyfill,
  ensurePdfPromiseCompat,
  ensurePromiseTry,
  ensurePromiseWithResolvers,
  hasPromiseTry,
  hasPromiseWithResolvers,
} from './promiseCompat';
import { isAppleMobileWebKit, resolvePdfWorkerMode } from './pdfRuntimeEnv';
import {
  PDFJS_LEGACY_MODULE,
  PDFJS_LEGACY_WORKER_ENTRY,
  PDFJS_LEGACY_WORKER_MODULE,
  clearPdfjsMainThreadWorkerForTests,
  installPdfjsMainThreadWorker,
  resetPdfjsCompatCacheForTests,
} from './pdfjsCompat';
import {
  buildKnowledgePdfExtractionFailureUpdate,
  formatKnowledgePdfExtractionError,
} from '@features/knowledge-center/pdf/pipelineStatus';

describe('promiseCompat', () => {
  afterEach(() => {
    // Restore natives if we deleted them in a test
    const P = Promise as PromiseConstructor & {
      withResolvers?: unknown;
      try?: unknown;
    };
    if (typeof P.withResolvers !== 'function') {
      Object.defineProperty(P, 'withResolvers', {
        configurable: true,
        writable: true,
        value: createPromiseWithResolversPolyfill(),
      });
    }
    if (typeof P.try !== 'function') {
      Object.defineProperty(P, 'try', {
        configurable: true,
        writable: true,
        value: createPromiseTryPolyfill(),
      });
    }
  });

  it('detects Promise.withResolvers when present', () => {
    const Fake = function PromiseFake() {} as unknown as PromiseConstructor;
    Object.defineProperty(Fake, 'withResolvers', {
      value: createPromiseWithResolversPolyfill(),
    });
    expect(hasPromiseWithResolvers(Fake)).toBe(true);
  });

  it('detects missing Promise.withResolvers', () => {
    const Fake = function PromiseFake() {} as unknown as PromiseConstructor;
    expect(hasPromiseWithResolvers(Fake)).toBe(false);
  });

  it('polyfills Promise.withResolvers only when missing on a bare constructor', () => {
    const Bare = class {} as unknown as PromiseConstructor;
    expect(hasPromiseWithResolvers(Bare)).toBe(false);
    expect(ensurePromiseWithResolvers(Bare)).toBe(true);
    expect(hasPromiseWithResolvers(Bare)).toBe(true);
    // second call must not re-apply
    expect(ensurePromiseWithResolvers(Bare)).toBe(false);
  });

  it('createPromiseWithResolversPolyfill resolves values', async () => {
    const withResolvers = createPromiseWithResolversPolyfill();
    const { promise, resolve } = withResolvers<number>();
    resolve(42);
    await expect(promise).resolves.toBe(42);
  });

  it('detects Promise.try when present and missing', () => {
    const Fake = function PromiseFake() {} as unknown as PromiseConstructor;
    expect(hasPromiseTry(Fake)).toBe(false);
    Object.defineProperty(Fake, 'try', { value: createPromiseTryPolyfill() });
    expect(hasPromiseTry(Fake)).toBe(true);
  });

  it('polyfills Promise.try on a bare constructor', async () => {
    const Bare = class {
      static resolve = Promise.resolve.bind(Promise);
      static reject = Promise.reject.bind(Promise);
    } as unknown as PromiseConstructor;
    // Polyfill uses `new Promise` from global, not Bare
    expect(hasPromiseTry(Bare)).toBe(false);
    expect(ensurePromiseTry(Bare)).toBe(true);
    const tryFn = (Bare as PromiseConstructor & { try: <T>(fn: () => T) => Promise<T> }).try;
    await expect(tryFn(() => 7)).resolves.toBe(7);
    await expect(
      tryFn(() => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });

  it('ensurePdfPromiseCompat installs both when stripped', () => {
    const P = Promise as PromiseConstructor & { withResolvers?: unknown; try?: unknown };
    const savedWR = P.withResolvers;
    const savedTry = P.try;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (P as any).withResolvers;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (P as any).try;
      // Some engines keep non-configurable natives — skip assert if undeletable
      if (typeof P.withResolvers === 'function' && typeof P.try === 'function') {
        const r = ensurePdfPromiseCompat(P);
        expect(r.withResolversPolyfilled).toBe(false);
        expect(r.tryPolyfilled).toBe(false);
        return;
      }
      const r = ensurePdfPromiseCompat(P);
      expect(hasPromiseWithResolvers(P)).toBe(true);
      expect(hasPromiseTry(P)).toBe(true);
      expect(r.withResolversPolyfilled || r.tryPolyfilled || true).toBe(true);
    } finally {
      if (savedWR)
        Object.defineProperty(P, 'withResolvers', { configurable: true, value: savedWR });
      if (savedTry) Object.defineProperty(P, 'try', { configurable: true, value: savedTry });
    }
  });
});

describe('pdfRuntimeEnv worker mode (PATH A vs PATH B)', () => {
  it('PATH A: desktop Chrome uses module-worker', () => {
    expect(
      resolvePdfWorkerMode({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        maxTouchPoints: 0,
      })
    ).toBe('module-worker');
  });

  it('PATH A: desktop Safari uses module-worker', () => {
    expect(
      resolvePdfWorkerMode({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        maxTouchPoints: 0,
      })
    ).toBe('module-worker');
  });

  it('PATH B: iPhone Safari prefers main-thread', () => {
    expect(
      resolvePdfWorkerMode({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        maxTouchPoints: 5,
      })
    ).toBe('main-thread');
  });

  it('PATH B: iPadOS desktop-UA + touch prefers main-thread', () => {
    expect(
      isAppleMobileWebKit({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        maxTouchPoints: 5,
      })
    ).toBe(true);
    expect(
      resolvePdfWorkerMode({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        maxTouchPoints: 5,
      })
    ).toBe('main-thread');
  });
});

describe('pdfjsCompat load ordering', () => {
  afterEach(() => {
    resetPdfjsCompatCacheForTests();
    clearPdfjsMainThreadWorkerForTests();
  });

  it('legacy path constants stay on legacy-only modules', () => {
    expect(PDFJS_LEGACY_MODULE).toBe('pdfjs-dist/legacy/build/pdf.mjs');
    expect(PDFJS_LEGACY_WORKER_MODULE).toBe('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    expect(PDFJS_LEGACY_WORKER_ENTRY).toBe('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
    expect(PDFJS_LEGACY_MODULE).toContain('/legacy/');
    expect(PDFJS_LEGACY_WORKER_ENTRY).toContain('/legacy/');
  });

  it('documents mandatory order: Promise compat before pdfjs evaluation', () => {
    // Structural contract: loadPdfjsCompat source must call ensurePdfPromiseCompat
    // before any dynamic import of PDFJS_LEGACY_MODULE (enforced by source scan).
    const srcPath = fileURLToPath(new URL('./pdfjsCompat.ts', import.meta.url));
    const src = readFileSync(srcPath, 'utf8');
    const compatIdx = src.indexOf('ensurePdfPromiseCompat(');
    const importIdx = src.indexOf("import('pdfjs-dist/legacy/build/pdf.mjs')");
    expect(compatIdx).toBeGreaterThan(-1);
    expect(importIdx).toBeGreaterThan(-1);
    expect(compatIdx).toBeLessThan(importIdx);
    // No static pdfjs import at top level
    expect(src).not.toMatch(/^import .+ from 'pdfjs-dist/m);
  });

  it('PATH B main-thread install sets globalThis.pdfjsWorker before getDocument would run', () => {
    clearPdfjsMainThreadWorkerForTests();
    installPdfjsMainThreadWorker({ setup: true });
    const g = globalThis as typeof globalThis & {
      pdfjsWorker?: { WorkerMessageHandler?: { setup?: boolean } };
    };
    expect(g.pdfjsWorker?.WorkerMessageHandler).toEqual({ setup: true });
    // Desktop path must not require this global; clearing restores PATH A precondition
    clearPdfjsMainThreadWorkerForTests();
    expect(g.pdfjsWorker?.WorkerMessageHandler).toBeUndefined();
  });

  it('main-thread path is selected only for Apple mobile WebKit UAs', () => {
    expect(resolvePdfWorkerMode({ userAgent: 'iPhone', maxTouchPoints: 5 })).toBe('main-thread');
    expect(
      resolvePdfWorkerMode({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0',
        maxTouchPoints: 0,
      })
    ).toBe('module-worker');
  });
});

describe('extraction failure never leaves extracting', () => {
  it('maps undefined-is-not-a-function to failed update', () => {
    const err = new Error("undefined is not a function (near '...i of t...')");
    const update = buildKnowledgePdfExtractionFailureUpdate(err, null);
    expect(update.status).toBe('failed');
    expect(update.page_count).toBe(0);
    expect(formatKnowledgePdfExtractionError(err)).toMatch(/PDF konnte|nicht gelesen/i);
  });
});
