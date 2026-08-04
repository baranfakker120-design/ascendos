import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = vi.hoisted(() => new Map<string, unknown>());

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => memory.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    memory.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    memory.delete(key);
  }),
  update: vi.fn(async (key: string, updater: (value: unknown) => unknown) => {
    memory.set(key, updater(memory.get(key)));
  }),
}));

import { enqueueSyncJob, getSyncQueue, pendingSyncCount } from './syncQueue';

describe('sync queue', () => {
  beforeEach(() => {
    memory.clear();
  });

  it('deduplicates jobs and keeps the newer updatedAt', async () => {
    const first = await enqueueSyncJob({
      type: 'profile_update',
      dedupeKey: 'profile:user-1',
      payload: { firstName: 'Ada' },
      updatedAt: 100,
    });
    const newer = await enqueueSyncJob({
      type: 'profile_update',
      dedupeKey: 'profile:user-1',
      payload: { firstName: 'Grace' },
      updatedAt: 200,
    });

    expect(await getSyncQueue()).toEqual([
      expect.objectContaining({
        id: first.id,
        payload: { firstName: 'Grace' },
        createdAt: 100,
        updatedAt: 200,
      }),
    ]);
    expect(newer.id).toBe(first.id);
  });

  it('does not let an older write overwrite newer pending data', async () => {
    const newer = await enqueueSyncJob({
      type: 'contact_update',
      dedupeKey: 'contact:update:1',
      payload: { name: 'Newest' },
      updatedAt: 300,
    });
    const ignored = await enqueueSyncJob({
      type: 'contact_update',
      dedupeKey: 'contact:update:1',
      payload: { name: 'Older' },
      updatedAt: 200,
    });

    expect(ignored).toEqual(newer);
    expect(await getSyncQueue()).toEqual([
      expect.objectContaining({
        payload: { name: 'Newest' },
        updatedAt: 300,
      }),
    ]);
  });

  it('reports the number of pending sync jobs', async () => {
    await enqueueSyncJob({
      type: 'mission_status',
      dedupeKey: 'mission:1',
      payload: { status: 'done' },
    });
    await enqueueSyncJob({
      type: 'journey_complete_step',
      dedupeKey: 'journey-step:1',
      payload: { stepId: '1' },
    });

    expect(await pendingSyncCount()).toBe(2);
  });
});
