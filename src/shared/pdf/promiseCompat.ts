/**
 * Minimal Promise API shims for older WebKit/Safari before pdfjs loads.
 * Apply only when the runtime is missing the API — never overwrite natives.
 */

export type PromiseWithResolversFn = <T = unknown>() => {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

export type PromiseTryFn = <T>(
  fn: (...args: unknown[]) => T | PromiseLike<T>,
  ...args: unknown[]
) => Promise<Awaited<T>>;

/** Pure: whether Promise.withResolvers is usable. */
export function hasPromiseWithResolvers(PromiseCtor: PromiseConstructor = Promise): boolean {
  return (
    typeof (PromiseCtor as PromiseConstructor & { withResolvers?: unknown }).withResolvers ===
    'function'
  );
}

/** Pure: whether Promise.try is usable. */
export function hasPromiseTry(PromiseCtor: PromiseConstructor = Promise): boolean {
  return typeof (PromiseCtor as PromiseConstructor & { try?: unknown }).try === 'function';
}

export function createPromiseWithResolversPolyfill(): PromiseWithResolversFn {
  return function withResolvers<T = unknown>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

export function createPromiseTryPolyfill(): PromiseTryFn {
  return function promiseTry<T>(
    fn: (...args: unknown[]) => T | PromiseLike<T>,
    ...args: unknown[]
  ): Promise<Awaited<T>> {
    return new Promise<Awaited<T>>((resolve, reject) => {
      try {
        resolve(fn(...args) as Awaited<T> | PromiseLike<Awaited<T>>);
      } catch (err) {
        reject(err);
      }
    });
  };
}

/**
 * Install withResolvers only when missing. Returns whether a polyfill was applied.
 */
export function ensurePromiseWithResolvers(PromiseCtor: PromiseConstructor = Promise): boolean {
  if (hasPromiseWithResolvers(PromiseCtor)) return false;
  Object.defineProperty(PromiseCtor, 'withResolvers', {
    configurable: true,
    writable: true,
    value: createPromiseWithResolversPolyfill(),
  });
  return true;
}

/**
 * Install Promise.try only when missing. Returns whether a polyfill was applied.
 */
export function ensurePromiseTry(PromiseCtor: PromiseConstructor = Promise): boolean {
  if (hasPromiseTry(PromiseCtor)) return false;
  Object.defineProperty(PromiseCtor, 'try', {
    configurable: true,
    writable: true,
    value: createPromiseTryPolyfill(),
  });
  return true;
}

/** Apply both pdfjs-critical Promise shims. Must run before pdfjs module evaluation. */
export function ensurePdfPromiseCompat(PromiseCtor: PromiseConstructor = Promise): {
  withResolversPolyfilled: boolean;
  tryPolyfilled: boolean;
} {
  return {
    withResolversPolyfilled: ensurePromiseWithResolvers(PromiseCtor),
    tryPolyfilled: ensurePromiseTry(PromiseCtor),
  };
}
