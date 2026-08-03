/**
 * Coach learns only from approved + active Knowledge Center articles.
 * Additive local index — does not alter knowledge_docs RAG / RPCs.
 */

import type { CoachKnowledgeArticle } from '@features/knowledge-center/types';

const STORAGE_SLOT = ['ascendos', 'coach-approved-knowledge', 'v1'].join('.');

export interface ApprovedKnowledgeSnapshot {
  id: string;
  title: string;
  category: string;
  tags: string[];
  bodyMarkdown: string;
  approvedAt: string | null;
  syncedAt: string;
}

/** In-memory fallback for Node/tests without localStorage. */
let memoryStore: ApprovedKnowledgeSnapshot[] = [];

function canUseLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

function read(): ApprovedKnowledgeSnapshot[] {
  if (!canUseLocalStorage()) return memoryStore;
  try {
    const raw = window.localStorage.getItem(STORAGE_SLOT);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ApprovedKnowledgeSnapshot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return memoryStore;
  }
}

function write(rows: ApprovedKnowledgeSnapshot[]) {
  const next = rows.slice(0, 200);
  memoryStore = next;
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_SLOT, JSON.stringify(next));
  } catch {
    // private mode
  }
}

export function listApprovedKnowledgeForCoach(): ApprovedKnowledgeSnapshot[] {
  return read();
}

export function syncApprovedKnowledgeFromArticles(articles: CoachKnowledgeArticle[]): void {
  const approved = articles.filter((a) => a.active && a.status === 'approved');
  write(
    approved.map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      tags: a.tags ?? [],
      bodyMarkdown: a.body_markdown,
      approvedAt: a.approved_at,
      syncedAt: new Date().toISOString(),
    }))
  );
}

export function rememberApprovedArticle(article: CoachKnowledgeArticle): void {
  if (!(article.active && article.status === 'approved')) return;
  const rest = read().filter((r) => r.id !== article.id);
  write([
    {
      id: article.id,
      title: article.title,
      category: article.category,
      tags: article.tags ?? [],
      bodyMarkdown: article.body_markdown,
      approvedAt: article.approved_at,
      syncedAt: new Date().toISOString(),
    },
    ...rest,
  ]);
}

/** Compact context block for Coach briefing / prompts. */
export function formatApprovedKnowledgeContext(limit = 6): string {
  const rows = read().slice(0, limit);
  if (rows.length === 0) return '';
  return rows
    .map(
      (r) =>
        `### ${r.title} (${r.category})\n${r.bodyMarkdown.slice(0, 1200)}${
          r.bodyMarkdown.length > 1200 ? '…' : ''
        }`
    )
    .join('\n\n');
}
