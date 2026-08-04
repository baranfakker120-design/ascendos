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

import { clearDraft, loadDraft, saveDraft } from './draftStore';

describe('draft store', () => {
  beforeEach(() => {
    memory.clear();
  });

  it('saves and loads a scoped draft', async () => {
    const draft = { title: 'Follow up', body: 'Call tomorrow' };

    await saveDraft('contact:new', draft);

    expect(await loadDraft<typeof draft>('contact:new')).toEqual(draft);
  });

  it('clears only the selected draft', async () => {
    await saveDraft('contact:new', { name: 'Ada' });
    await saveDraft('profile:edit', { firstName: 'Grace' });

    await clearDraft('contact:new');

    expect(await loadDraft('contact:new')).toBeNull();
    expect(await loadDraft('profile:edit')).toEqual({ firstName: 'Grace' });
  });
});
