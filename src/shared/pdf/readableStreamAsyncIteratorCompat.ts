/**
 * Minimal ReadableStream async-iterator compatibility for WebKit/Safari.
 *
 * PDF.js 6.x `PDFPageProxy.getTextContent()` does:
 *   for await (const chunk of streamTextContent(...)) { ... }
 * which desugars to ReadableStream.prototype[Symbol.asyncIterator]().
 *
 * Safari/iOS (including 18.x) often has for-await syntax but no
 * ReadableStream async iterator until ~Safari 26.4/27 → TypeError
 * "undefined is not a function (near '...i of t...')".
 *
 * Install only when missing; never overwrite a native implementation.
 */

export type ReadableStreamCtor = typeof ReadableStream;

let installed = false;

type ReadableStreamProto = ReadableStream & {
  [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
};

/** Pure: whether this ReadableStream already exposes async iteration. */
export function hasReadableStreamAsyncIterator(
  StreamCtor: ReadableStreamCtor | undefined = typeof ReadableStream !== 'undefined'
    ? ReadableStream
    : undefined
): boolean {
  if (!StreamCtor || typeof Symbol === 'undefined' || !Symbol.asyncIterator) {
    return false;
  }
  const proto = StreamCtor.prototype as ReadableStreamProto;
  return typeof proto[Symbol.asyncIterator] === 'function';
}

/**
 * Whether the polyfill should be installed for this runtime.
 * Requires ReadableStream + Symbol.asyncIterator, and a missing stream asyncIterator.
 */
export function shouldInstallReadableStreamAsyncIterator(
  StreamCtor: ReadableStreamCtor | undefined = typeof ReadableStream !== 'undefined'
    ? ReadableStream
    : undefined
): boolean {
  if (!StreamCtor) return false;
  if (typeof Symbol === 'undefined' || !Symbol.asyncIterator) return false;
  return !hasReadableStreamAsyncIterator(StreamCtor);
}

/**
 * Create an AsyncIterator that consumes via getReader().
 * Exposed for unit tests without mutating globals.
 */
export function createReadableStreamAsyncIterator<T = unknown>(
  stream: ReadableStream<T>
): AsyncIterator<T, undefined, undefined> {
  const reader = stream.getReader();
  let finished = false;

  const finish = async (cancelReason?: unknown): Promise<IteratorResult<T, undefined>> => {
    if (finished) return { value: undefined, done: true };
    finished = true;
    try {
      if (cancelReason !== undefined) {
        await reader.cancel(cancelReason);
      } else {
        reader.releaseLock();
      }
    } catch {
      // Best-effort cleanup; iteration is already terminating.
    }
    return { value: undefined, done: true };
  };

  return {
    async next(): Promise<IteratorResult<T, undefined>> {
      if (finished) return { value: undefined, done: true };
      try {
        const result = await reader.read();
        if (result.done) {
          finished = true;
          try {
            reader.releaseLock();
          } catch {
            // ignore
          }
          return { value: undefined, done: true };
        }
        return { value: result.value as T, done: false };
      } catch (err) {
        finished = true;
        try {
          reader.releaseLock();
        } catch {
          // ignore
        }
        throw err;
      }
    },
    async return(value?: unknown): Promise<IteratorResult<T, undefined>> {
      void value;
      return finish('readable_stream_async_iterator_return');
    },
    async throw(err?: unknown): Promise<IteratorResult<T, undefined>> {
      await finish(err);
      throw err;
    },
  };
}

/**
 * Install ReadableStream.prototype[Symbol.asyncIterator] when missing.
 * Idempotent: safe to call multiple times; never overwrites natives.
 * @returns true if a polyfill was installed on this call.
 */
export function ensureReadableStreamAsyncIterator(
  StreamCtor: ReadableStreamCtor | undefined = typeof ReadableStream !== 'undefined'
    ? ReadableStream
    : undefined
): boolean {
  if (!shouldInstallReadableStreamAsyncIterator(StreamCtor)) {
    return false;
  }
  if (installed && hasReadableStreamAsyncIterator(StreamCtor)) {
    return false;
  }

  const ctor = StreamCtor!;
  const asyncIterator = function readableStreamAsyncIterator<T>(
    this: ReadableStream<T>
  ): AsyncIterator<T, undefined, undefined> {
    return createReadableStreamAsyncIterator(this);
  };

  Object.defineProperty(ctor.prototype as ReadableStreamProto, Symbol.asyncIterator, {
    configurable: true,
    writable: true,
    enumerable: false,
    value: asyncIterator,
  });

  installed = true;
  return true;
}

/** Test helper — reset install flag (does not remove a native implementation). */
export function resetReadableStreamAsyncIteratorInstallFlagForTests(): void {
  installed = false;
}

/**
 * Test helper — remove polyfill property if present (only when configurable).
 * Does not touch a non-configurable native.
 */
export function removeReadableStreamAsyncIteratorForTests(
  StreamCtor: ReadableStreamCtor | undefined = typeof ReadableStream !== 'undefined'
    ? ReadableStream
    : undefined
): boolean {
  installed = false;
  if (!StreamCtor || typeof Symbol === 'undefined' || !Symbol.asyncIterator) return false;
  const proto = StreamCtor.prototype as ReadableStreamProto;
  if (typeof proto[Symbol.asyncIterator] !== 'function') return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete proto[Symbol.asyncIterator];
    return typeof proto[Symbol.asyncIterator] !== 'function';
  } catch {
    return false;
  }
}
