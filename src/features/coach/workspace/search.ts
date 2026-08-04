import type { WorkspaceConversation } from './types';

/** Search by name, topic, kind, preview, and calendar date (yyyy-mm-dd / locale fragments). */
export function filterConversations(
  conversations: WorkspaceConversation[],
  query: string
): WorkspaceConversation[] {
  const q = query.trim().toLowerCase();
  if (!q) return conversations;

  return conversations.filter((c) => {
    const date = (c.updatedAt || c.createdAt || '').slice(0, 10);
    const hay = [
      c.title,
      c.topic ?? '',
      c.kind,
      c.partnerName ?? '',
      c.preview ?? '',
      date,
      formatLooseDate(c.updatedAt || c.createdAt),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

function formatLooseDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  try {
    return new Date(t).toLocaleDateString();
  } catch {
    return '';
  }
}

export function sortConversations(conversations: WorkspaceConversation[]): WorkspaceConversation[] {
  return [...conversations].sort((a, b) => {
    const aArch = a.archivedAt ? 1 : 0;
    const bArch = b.archivedAt ? 1 : 0;
    if (aArch !== bArch) return aArch - bArch;
    return Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt);
  });
}
