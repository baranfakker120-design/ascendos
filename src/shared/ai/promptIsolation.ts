/**
 * Phase 6 — AI / Knowledge prompt isolation (pure helpers).
 *
 * Mirrors the coach-chat context chain:
 *   auth → active membership → current org → agent → knowledge → history → prompt
 *
 * Platform context may be global. Organization / knowledge / conversation
 * context must never cross tenants.
 */

export const ORG_A_SECRET = 'ASCENDOS_ORG_A_SECRET_9F31';
export const ORG_B_SECRET = 'ASCENDOS_ORG_B_SECRET_7K82';
export const ORG_A_CMS_SECRET = 'ASCENDOS_ORG_A_CMS_SECRET';
export const ORG_B_CMS_SECRET = 'ASCENDOS_ORG_B_CMS_SECRET';
export const ORG_A_CONVERSATION_SECRET = 'ORG_A_CONVERSATION_SECRET';
export const ORG_B_CONVERSATION_SECRET = 'ORG_B_CONVERSATION_SECRET';
export const ORG_A_INGEST_SECRET = 'ASCENDOS_INGEST_A_SECRET';
export const ORG_B_INGEST_SECRET = 'ASCENDOS_INGEST_B_SECRET';

export type PromptBlockKind =
  | 'platform'
  | 'organization'
  | 'membership'
  | 'knowledge'
  | 'cms'
  | 'conversation';

export interface PromptBlock {
  kind: PromptBlockKind;
  orgId: string | null;
  text: string;
}

export interface AgentRow {
  org_id: string;
  key: string;
  system_prompt: string;
  is_active?: boolean;
}

export interface KnowledgeMatch {
  org_id: string;
  content: string;
  doc_title?: string;
  similarity?: number;
}

export interface CmsArticleRow {
  org_id: string;
  status: string;
  active?: boolean;
  body_markdown: string;
  title?: string;
}

export interface ConvoRow {
  id: string;
  org_id: string;
  user_id: string;
  agent_key?: string | null;
}

export interface MessageRow {
  role: 'user' | 'assistant';
  content: string;
}

/** RAG RPC args: p_org_id must be the server-resolved org only. */
export function buildMatchKnowledgeOrgArgs(serverOrgId: string): { p_org_id: string } {
  return { p_org_id: serverOrgId };
}

/** Reject client p_org_id that does not match current org (SQL mirror). */
export function assertMatchKnowledgeOrgId(
  pOrgId: string,
  currentOrgId: string | null
): { ok: true } | { ok: false; error: 'foreign_org' } {
  if (!currentOrgId || pOrgId !== currentOrgId) {
    return { ok: false, error: 'foreign_org' };
  }
  return { ok: true };
}

/**
 * Org-filtered retrieval then top-K — never global top-K then filter.
 * Similarity must not promote a foreign chunk into the result set.
 */
export function retrieveOrgKnowledgeTopK(
  candidates: KnowledgeMatch[],
  orgId: string,
  matchCount: number
): KnowledgeMatch[] {
  return candidates
    .filter((c) => c.org_id === orgId)
    .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
    .slice(0, matchCount);
}

export function selectOrgAgent(
  agents: AgentRow[],
  orgId: string,
  agentKey: string
): AgentRow | null {
  return (
    agents.find(
      (a) => a.org_id === orgId && a.key === agentKey && a.is_active !== false
    ) ?? null
  );
}

/** Load conversation only when it belongs to the active org (+ user). */
export function loadOrgConversation(
  convos: ConvoRow[],
  convoId: string,
  userId: string,
  orgId: string
): ConvoRow | null {
  return (
    convos.find((c) => c.id === convoId && c.user_id === userId && c.org_id === orgId) ??
    null
  );
}

/**
 * CMS articles for AI context (helper only — coach-chat does not wire CMS
 * into prompts yet). Filters by org + approved/active.
 */
export function filterCmsArticlesForOrgAi(
  articles: CmsArticleRow[],
  orgId: string
): CmsArticleRow[] {
  return articles.filter(
    (a) => a.org_id === orgId && a.status === 'approved' && a.active !== false
  );
}

export function buildUsageEventOrgAttribution(
  userId: string,
  orgId: string,
  eventType: string,
  metadata: Record<string, unknown> = {}
): { user_id: string; org_id: string; event_type: string; metadata: Record<string, unknown> } {
  return { user_id: userId, org_id: orgId, event_type: eventType, metadata };
}

/** Ingest binding: doc + chunks must stay on the active org. */
export function bindIngestToOrg(
  activeOrgId: string,
  bodyOrgId: unknown
): { ok: true; org_id: string } | { ok: false; error: 'org_mismatch' } {
  if (bodyOrgId !== undefined && bodyOrgId !== null && bodyOrgId !== '') {
    if (String(bodyOrgId) !== activeOrgId) {
      return { ok: false, error: 'org_mismatch' };
    }
  }
  return { ok: true, org_id: activeOrgId };
}

export function textContainsMarker(text: string, marker: string): boolean {
  return text.includes(marker);
}

/**
 * Assemble classified prompt blocks. Rejects org-scoped blocks whose orgId
 * does not match the active org (platform blocks may use orgId=null).
 */
export function assembleTenantSafePrompt(
  activeOrgId: string,
  blocks: PromptBlock[]
): { ok: true; prompt: string } | { ok: false; error: 'foreign_block'; foreignKind: PromptBlockKind } {
  for (const block of blocks) {
    if (block.kind === 'platform') continue;
    if (block.orgId !== activeOrgId) {
      return { ok: false, error: 'foreign_block', foreignKind: block.kind };
    }
  }
  return {
    ok: true,
    prompt: blocks
      .map((b) => b.text)
      .filter((t) => t.trim().length > 0)
      .join('\n\n'),
  };
}

/** Inspect AI context text for foreign tenant markers. */
export function inspectAiContextIsolation(
  contextText: string,
  allowedMarkers: string[],
  forbiddenMarkers: string[]
): {
  allowedPresent: boolean;
  foreignLeak: boolean;
  leakedMarkers: string[];
} {
  const leakedMarkers = forbiddenMarkers.filter((m) => contextText.includes(m));
  return {
    allowedPresent: allowedMarkers.every((m) => contextText.includes(m)),
    foreignLeak: leakedMarkers.length > 0,
    leakedMarkers,
  };
}

/**
 * Build the knowledge block string the same way coach-chat does
 * (title + content), for isolation assertions on retrieved chunks.
 */
export function formatKnowledgeBlock(
  matches: Array<{ doc_title: string; content: string }>,
  header: string
): string {
  if (matches.length === 0) return '';
  return (
    `${header}:\n` + matches.map((m) => `[${m.doc_title}]\n${m.content}`).join('\n---\n')
  );
}
