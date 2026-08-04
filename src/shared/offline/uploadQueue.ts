import { idbGet, idbSet } from './idb';
import { isNetworkError, isOnline } from './networkStatus';
import { OFFLINE_KEYS } from './keys';

export type UploadKind =
  'avatar' | 'knowledge' | 'story' | 'coaching_media' | 'share_proof' | 'generic';

export interface UploadJob {
  id: string;
  kind: UploadKind;
  /** Stable key — same key replaces older pending blob (newest wins). */
  dedupeKey: string;
  /** Object URL or data URL for preview; blob stored as base64 for durability. */
  fileName: string;
  mimeType: string;
  base64: string;
  meta: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  lastError?: string;
}

export type UploadHandler = (job: UploadJob, file: File) => Promise<void>;

const handlers = new Map<UploadKind, UploadHandler>();
const listeners = new Set<() => void>();
let flushing = false;

function notify() {
  listeners.forEach((l) => l());
}

export function subscribeUploadQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerUploadHandler(kind: UploadKind, handler: UploadHandler): void {
  handlers.set(kind, handler);
}

async function readQueue(): Promise<UploadJob[]> {
  return (await idbGet<UploadJob[]>(OFFLINE_KEYS.uploadQueue)) ?? [];
}

async function writeQueue(jobs: UploadJob[]): Promise<void> {
  await idbSet(OFFLINE_KEYS.uploadQueue, jobs);
  notify();
}

export async function pendingUploadCount(): Promise<number> {
  return (await readQueue()).length;
}

export async function getUploadQueue(): Promise<UploadJob[]> {
  return readQueue();
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function base64ToFile(job: UploadJob): File {
  const binary = atob(job.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], job.fileName, { type: job.mimeType });
}

export async function enqueueUpload(input: {
  kind: UploadKind;
  dedupeKey: string;
  file: File;
  meta?: Record<string, unknown>;
}): Promise<UploadJob> {
  const now = Date.now();
  const base64 = await fileToBase64(input.file);
  const queue = await readQueue();
  const existingIdx = queue.findIndex((j) => j.dedupeKey === input.dedupeKey);
  const job: UploadJob = {
    id:
      existingIdx >= 0
        ? queue[existingIdx]!.id
        : `upl_${now}_${Math.random().toString(36).slice(2, 9)}`,
    kind: input.kind,
    dedupeKey: input.dedupeKey,
    fileName: input.file.name || `${input.kind}.bin`,
    mimeType: input.file.type || 'application/octet-stream',
    base64,
    meta: input.meta ?? {},
    createdAt: existingIdx >= 0 ? queue[existingIdx]!.createdAt : now,
    updatedAt: now,
    attempts: 0,
  };
  if (existingIdx >= 0) queue[existingIdx] = job;
  else queue.push(job);
  await writeQueue(queue);
  return job;
}

export async function runUploadOrEnqueue(input: {
  kind: UploadKind;
  dedupeKey: string;
  file: File;
  meta?: Record<string, unknown>;
  execute: (file: File) => Promise<void>;
}): Promise<{ status: 'synced' } | { status: 'queued'; job: UploadJob }> {
  if (!isOnline()) {
    const job = await enqueueUpload(input);
    return { status: 'queued', job };
  }
  try {
    await input.execute(input.file);
    const queue = await readQueue();
    const filtered = queue.filter((j) => j.dedupeKey !== input.dedupeKey);
    if (filtered.length !== queue.length) await writeQueue(filtered);
    return { status: 'synced' };
  } catch (err) {
    if (isNetworkError(err)) {
      const job = await enqueueUpload(input);
      return { status: 'queued', job };
    }
    throw err;
  }
}

export async function flushUploadQueue(): Promise<{ flushed: number; remaining: number }> {
  if (flushing) return { flushed: 0, remaining: await pendingUploadCount() };
  if (!isOnline()) return { flushed: 0, remaining: await pendingUploadCount() };

  flushing = true;
  let flushed = 0;
  try {
    let queue = await readQueue();
    while (queue.length > 0) {
      if (!isOnline()) break;
      const job = queue[0]!;
      const handler = handlers.get(job.kind);
      if (!handler) {
        queue = queue.slice(1);
        await writeQueue(queue);
        continue;
      }
      try {
        await handler(job, base64ToFile(job));
        queue = queue.slice(1);
        await writeQueue(queue);
        flushed += 1;
      } catch (err) {
        if (isNetworkError(err)) {
          job.attempts += 1;
          job.lastError = err instanceof Error ? err.message : 'network';
          queue[0] = job;
          await writeQueue(queue);
          break;
        }
        job.attempts += 1;
        job.lastError = err instanceof Error ? err.message : String(err);
        if (job.attempts >= 8) {
          console.error('AscendOS upload: dropping job', job.kind, job.lastError);
          queue = queue.slice(1);
        } else {
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
