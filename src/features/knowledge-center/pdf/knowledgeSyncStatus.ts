/**
 * Knowledge Operating Model — CMS vs Coach RAG sync status.
 *
 * CMS articles (coach_knowledge_*) and RAG (knowledge_docs/chunks) are
 * separate stores. Coach chat only reads RAG. This helper makes the gap
 * explicit so admins do not assume Knowledge Center publish == Coach brain.
 */

export type KnowledgeSyncState =
  | 'cms_only'
  | 'rag_only'
  | 'synced'
  | 'cms_draft_rag_pending'
  | 'disconnected';

export type KnowledgeSyncInput = {
  /** CMS article id if present */
  articleId: string | null;
  /** CMS publication status when known */
  articleStatus?: 'draft' | 'published' | 'archived' | string | null;
  /** Linked RAG knowledge_docs id */
  ragDocId: string | null;
  /** Explicit opt-in flag from PDF pipeline */
  coachRagEnabled?: boolean;
};

export type KnowledgeSyncStatus = {
  state: KnowledgeSyncState;
  coachCanRetrieve: boolean;
  adminHint: string;
};

export function resolveKnowledgeSyncStatus(input: KnowledgeSyncInput): KnowledgeSyncStatus {
  const hasArticle = Boolean(input.articleId);
  const hasRag = Boolean(input.ragDocId);
  const ragEnabled = input.coachRagEnabled === true;
  const published =
    input.articleStatus === 'published' ||
    input.articleStatus === 'approved' ||
    input.articleStatus == null;

  if (hasArticle && hasRag && (ragEnabled || published)) {
    return {
      state: 'synced',
      coachCanRetrieve: true,
      adminHint: 'cms_and_rag_linked',
    };
  }

  if (hasArticle && hasRag && !ragEnabled) {
    return {
      state: 'cms_draft_rag_pending',
      coachCanRetrieve: false,
      adminHint: 'rag_linked_but_not_enabled_for_coach',
    };
  }

  if (hasArticle && !hasRag) {
    return {
      state: 'cms_only',
      coachCanRetrieve: false,
      adminHint: 'knowledge_center_only_enable_coach_rag_to_ingest',
    };
  }

  if (!hasArticle && hasRag) {
    return {
      state: 'rag_only',
      coachCanRetrieve: true,
      adminHint: 'coach_rag_without_cms_article',
    };
  }

  return {
    state: 'disconnected',
    coachCanRetrieve: false,
    adminHint: 'no_cms_no_rag',
  };
}
