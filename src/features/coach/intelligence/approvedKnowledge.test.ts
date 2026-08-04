import { describe, expect, it } from 'vitest';
import {
  listApprovedKnowledgeForCoach,
  rememberApprovedArticle,
  syncApprovedKnowledgeFromArticles,
} from './approvedKnowledge';
import type { CoachKnowledgeArticle } from '@features/knowledge-center/types';

function article(
  partial: Partial<CoachKnowledgeArticle> &
    Pick<CoachKnowledgeArticle, 'id' | 'title' | 'status' | 'active'>
): CoachKnowledgeArticle {
  return {
    slug: 'slug',
    body_markdown: 'Approved body with enough content for coach learning.',
    body_html: '',
    category: 'Allgemein',
    tags: [],
    contradiction_flags: [],
    contradiction_summary: null,
    created_by: null,
    updated_by: null,
    approved_by: null,
    approved_at: '2026-08-03T10:00:00.000Z',
    current_version: 1,
    created_at: '2026-08-03T10:00:00.000Z',
    updated_at: '2026-08-03T10:00:00.000Z',
    ...partial,
  };
}

describe('approvedKnowledge', () => {
  it('learns only from approved active articles', () => {
    syncApprovedKnowledgeFromArticles([
      article({ id: 'a', title: 'A', status: 'approved', active: true }),
      article({ id: 'b', title: 'B', status: 'needs_review', active: false }),
      article({ id: 'c', title: 'C', status: 'draft', active: false }),
    ]);
    expect(listApprovedKnowledgeForCoach().map((r) => r.id)).toEqual(['a']);
    rememberApprovedArticle(article({ id: 'd', title: 'D', status: 'approved', active: true }));
    expect(listApprovedKnowledgeForCoach().some((r) => r.id === 'd')).toBe(true);
  });
});
