type Listener = (online: boolean) => void;

const listeners = new Set<Listener>();

function readOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

let online = readOnline();

function emit() {
  const next = readOnline();
  if (next === online) return;
  online = next;
  listeners.forEach((l) => l(online));
}

let wired = false;

export function ensureNetworkListeners(): void {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  window.addEventListener('online', emit);
  window.addEventListener('offline', emit);
}

export function isOnline(): boolean {
  return readOnline();
}

export function subscribeNetwork(listener: Listener): () => void {
  ensureNetworkListeners();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Network / transport failures that should enter the outbox. */
export function isNetworkError(err: unknown): boolean {
  if (!isOnline()) return true;
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|offline/i.test(
    msg
  );
}
