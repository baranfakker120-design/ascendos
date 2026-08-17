import { describe, expect, it } from 'vitest';
import { resolveKnowledgeSyncStatus } from './knowledgeSyncStatus';

describe('resolveKnowledgeSyncStatus', () => {
  it('cms_only when article without rag', () => {
    const s = resolveKnowledgeSyncStatus({
      articleId: 'a1',
      articleStatus: 'published',
      ragDocId: null,
    });
    expect(s.state).toBe('cms_only');
    expect(s.coachCanRetrieve).toBe(false);
  });

  it('synced when article + rag linked', () => {
    const s = resolveKnowledgeSyncStatus({
      articleId: 'a1',
      articleStatus: 'published',
      ragDocId: 'r1',
      coachRagEnabled: true,
    });
    expect(s.state).toBe('synced');
    expect(s.coachCanRetrieve).toBe(true);
  });

  it('rag_only when coach ingest without cms', () => {
    const s = resolveKnowledgeSyncStatus({
      articleId: null,
      ragDocId: 'r1',
    });
    expect(s.state).toBe('rag_only');
    expect(s.coachCanRetrieve).toBe(true);
  });

  it('disconnected when neither', () => {
    const s = resolveKnowledgeSyncStatus({
      articleId: null,
      ragDocId: null,
    });
    expect(s.state).toBe('disconnected');
    expect(s.coachCanRetrieve).toBe(false);
  });
});
