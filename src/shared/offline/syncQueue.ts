import { idbGet, idbSet } from './idb';
import { isNetworkError, isOnline } from './networkStatus';
import { OFFLINE_KEYS } from './keys';

export type SyncJobType =
  | 'mission_status'
  | 'contact_create'
  | 'contact_update'
  | 'pipeline_event'
  | 'leadership_note'
  | 'profile_update'
  | 'journey_complete_step';

export interface SyncJob {
  id: string;
  type: SyncJobType;
  /** Stable key — same key replaces older pending job (no duplicates). */
  dedupeKey: string;
  payload: unknown;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  lastError?: string;
}

export type SyncJobHandler = (job: SyncJob) => Promise<void>;

const handlers = new Map<SyncJobType, SyncJobHandler>();
const statusListeners = new Set<() => void>();

let flushing = false;

function notify() {
  statusListeners.forEach((l) => l());
}

export function subscribeSyncQueue(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function registerSyncHandler(type: SyncJobType, handler: SyncJobHandler): void {
  handlers.set(type, handler);
}

async function readQueue(): Promise<SyncJob[]> {
  return (await idbGet<SyncJob[]>(OFFLINE_KEYS.syncQueue)) ?? [];
}

async function writeQueue(jobs: SyncJob[]): Promise<void> {
  await idbSet(OFFLINE_KEYS.syncQueue, jobs);
  notify();
}

export async function getSyncQueue(): Promise<SyncJob[]> {
  return readQueue();
}

export async function pendingSyncCount(): Promise<number> {
  return (await readQueue()).length;
}

/**
 * Enqueue a job. Same dedupeKey replaces the older pending job
 * only if this write is newer (never lose the newest user intent).
 */
export async function enqueueSyncJob(input: {
  type: SyncJobType;
  dedupeKey: string;
  payload: unknown;
  updatedAt?: number;
}): Promise<SyncJob> {
  const now = input.updatedAt ?? Date.now();
  const queue = await readQueue();
  const existingIdx = queue.findIndex((j) => j.dedupeKey === input.dedupeKey);
  if (existingIdx >= 0) {
    const existing = queue[existingIdx]!;
    if (now < existing.updatedAt) {
      // Incoming is older — keep newer pending data.
      return existing;
    }
    const next: SyncJob = {
      ...existing,
      type: input.type,
      payload: input.payload,
      updatedAt: now,
      lastError: undefined,
    };
    queue[existingIdx] = next;
    await writeQueue(queue);
    return next;
  }

  const job: SyncJob = {
    id: `sync_${now}_${Math.random().toString(36).slice(2, 9)}`,
    type: input.type,
    dedupeKey: input.dedupeKey,
    payload: input.payload,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
  };
  queue.push(job);
  await writeQueue(queue);
  return job;
}

export async function removeSyncJob(id: string): Promise<void> {
  const queue = (await readQueue()).filter((j) => j.id !== id);
  await writeQueue(queue);
}

/**
 * Flush pending jobs in FIFO order.
 * Successful jobs removed. Transient network errors leave job and stop flush.
 * Permanent errors bump attempts; after 8 attempts drop with console error
 * (user already has local optimistic state / draft).
 */
export async function flushSyncQueue(): Promise<{ flushed: number; remaining: number }> {
  if (flushing) {
    const remaining = await pendingSyncCount();
    return { flushed: 0, remaining };
  }
  if (!isOnline()) {
    return { flushed: 0, remaining: await pendingSyncCount() };
  }

  flushing = true;
  let flushed = 0;
  try {
    let queue = await readQueue();
    while (queue.length > 0) {
      if (!isOnline()) break;
      const job = queue[0]!;
      const handler = handlers.get(job.type);
      if (!handler) {
        // Unknown type — drop to avoid permanent jam (forward-compat).
        queue = queue.slice(1);
        await writeQueue(queue);
        continue;
      }
      try {
        await handler(job);
        queue = queue.slice(1);
        await writeQueue(queue);
        flushed += 1;
      } catch (err) {
        if (isNetworkError(err)) {
          job.lastError = err instanceof Error ? err.message : 'network';
          job.attempts += 1;
          queue[0] = job;
          await writeQueue(queue);
          break;
        }
        job.attempts += 1;
        job.lastError = err instanceof Error ? err.message : String(err);
        if (job.attempts >= 8) {
          console.error('AscendOS sync: dropping job after retries', job.type, job.lastError);
          queue = queue.slice(1);
        } else {
          queue[0] = job;
          // Move to end so one bad job doesn't block the rest forever.
          queue = [...queue.slice(1), job];
        }
        await writeQueue(queue);
      }
    }
    return { flushed, remaining: queue.length };
  } finally {
    flushing = false;
    notify();
  }
}

/**
 * Run now if online; otherwise enqueue. On network failure mid-flight, enqueue.
 * Never duplicates: dedupeKey coalesces.
 */
export async function runOrEnqueue<T>(opts: {
  type: SyncJobType;
  dedupeKey: string;
  payload: unknown;
  execute: () => Promise<T>;
}): Promise<{ status: 'synced'; data: T } | { status: 'queued'; job: SyncJob }> {
  if (!isOnline()) {
    const job = await enqueueSyncJob(opts);
    return { status: 'queued', job };
  }
  try {
    const data = await opts.execute();
    // Clear any stale queued twin for this dedupe key.
    const queue = await readQueue();
    const filtered = queue.filter((j) => j.dedupeKey !== opts.dedupeKey);
    if (filtered.length !== queue.length) await writeQueue(filtered);
    return { status: 'synced', data };
  } catch (err) {
    if (isNetworkError(err)) {
      const job = await enqueueSyncJob(opts);
      return { status: 'queued', job };
    }
    throw err;
  }
}
