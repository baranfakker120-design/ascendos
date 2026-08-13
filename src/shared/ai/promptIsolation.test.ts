import { describe, expect, it } from 'vitest';
import {
  ORG_A_CMS_SECRET,
  ORG_A_CONVERSATION_SECRET,
  ORG_A_INGEST_SECRET,
  ORG_A_SECRET,
  ORG_B_CMS_SECRET,
  ORG_B_CONVERSATION_SECRET,
  ORG_B_INGEST_SECRET,
  ORG_B_SECRET,
  assembleTenantSafePrompt,
  assertMatchKnowledgeOrgId,
  bindIngestToOrg,
  buildMatchKnowledgeOrgArgs,
  buildUsageEventOrgAttribution,
  filterCmsArticlesForOrgAi,
  formatKnowledgeBlock,
  inspectAiContextIsolation,
  loadOrgConversation,
  retrieveOrgKnowledgeTopK,
  selectOrgAgent,
  textContainsMarker,
} from './promptIsolation';

const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const orgB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const userAb = 'u-ab';

describe('Phase 6 — match_knowledge org args', () => {
  it('p_org_id is always the server org (never client trust)', () => {
    expect(buildMatchKnowledgeOrgArgs(orgA)).toEqual({ p_org_id: orgA });
    expect(buildMatchKnowledgeOrgArgs(orgA).p_org_id).not.toBe(orgB);
  });

  it('rejects p_org_id ≠ current_org_id (forged / manipulated)', () => {
    expect(assertMatchKnowledgeOrgId(orgB, orgA)).toEqual({
      ok: false,
      error: 'foreign_org',
    });
    expect(assertMatchKnowledgeOrgId(orgA, null)).toEqual({
      ok: false,
      error: 'foreign_org',
    });
    expect(assertMatchKnowledgeOrgId(orgA, orgA)).toEqual({ ok: true });
  });
});

describe('Phase 6 — embedding retrieval isolation (org filter before top-K)', () => {
  const candidates = [
    {
      org_id: orgB,
      content: ORG_B_SECRET,
      doc_title: 'B',
      similarity: 0.99,
    },
    {
      org_id: orgA,
      content: ORG_A_SECRET,
      doc_title: 'A',
      similarity: 0.4,
    },
    {
      org_id: orgA,
      content: 'other A',
      doc_title: 'A2',
      similarity: 0.35,
    },
  ];

  it('A retrieval never returns B secret even when B has higher similarity', () => {
    const hits = retrieveOrgKnowledgeTopK(candidates, orgA, 5);
    const block = formatKnowledgeBlock(
      hits.map((h) => ({ doc_title: h.doc_title ?? '', content: h.content })),
      'EXTRACTS'
    );
    expect(textContainsMarker(block, ORG_A_SECRET)).toBe(true);
    expect(textContainsMarker(block, ORG_B_SECRET)).toBe(false);
    expect(hits.every((h) => h.org_id === orgA)).toBe(true);
  });

  it('B retrieval never returns A secret', () => {
    const hits = retrieveOrgKnowledgeTopK(candidates, orgB, 5);
    const block = formatKnowledgeBlock(
      hits.map((h) => ({ doc_title: h.doc_title ?? '', content: h.content })),
      'EXTRACTS'
    );
    expect(textContainsMarker(block, ORG_B_SECRET)).toBe(true);
    expect(textContainsMarker(block, ORG_A_SECRET)).toBe(false);
  });

  it('ingest markers stay tenant-bound in retrieval', () => {
    const ingest = [
      { org_id: orgA, content: ORG_A_INGEST_SECRET, similarity: 0.9 },
      { org_id: orgB, content: ORG_B_INGEST_SECRET, similarity: 0.95 },
    ];
    const aOnly = retrieveOrgKnowledgeTopK(ingest, orgA, 3);
    expect(aOnly).toHaveLength(1);
    expect(aOnly[0].content).toBe(ORG_A_INGEST_SECRET);
  });
});

describe('Phase 6 — agent isolation', () => {
  const agents = [
    { org_id: orgA, key: 'knowledge', system_prompt: 'Agent A' },
    { org_id: orgB, key: 'knowledge', system_prompt: 'Agent B' },
  ];

  it('header A → Agent A only', () => {
    expect(selectOrgAgent(agents, orgA, 'knowledge')?.system_prompt).toBe('Agent A');
  });

  it('header B → Agent B only', () => {
    expect(selectOrgAgent(agents, orgB, 'knowledge')?.system_prompt).toBe('Agent B');
  });

  it('no global fallback agent across orgs', () => {
    expect(selectOrgAgent(agents, orgA, 'missing')).toBeNull();
  });
});

describe('Phase 6 — conversation / chat history isolation', () => {
  const convos = [
    {
      id: 'c-a',
      org_id: orgA,
      user_id: userAb,
      agent_key: 'knowledge',
    },
    {
      id: 'c-b',
      org_id: orgB,
      user_id: userAb,
      agent_key: 'knowledge',
    },
  ];
  const historyA: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: ORG_A_CONVERSATION_SECRET },
  ];
  const historyB: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: ORG_B_CONVERSATION_SECRET },
  ];

  it('AB header A → only A conversation', () => {
    expect(loadOrgConversation(convos, 'c-a', userAb, orgA)?.id).toBe('c-a');
    expect(loadOrgConversation(convos, 'c-b', userAb, orgA)).toBeNull();
  });

  it('AB header B → only B conversation', () => {
    expect(loadOrgConversation(convos, 'c-b', userAb, orgB)?.id).toBe('c-b');
    expect(loadOrgConversation(convos, 'c-a', userAb, orgB)).toBeNull();
  });

  it('chat history secrets do not cross tenants in prompt inspection', () => {
    const aCtx = historyA.map((m) => m.content).join('\n');
    const bCtx = historyB.map((m) => m.content).join('\n');
    expect(
      inspectAiContextIsolation(aCtx, [ORG_A_CONVERSATION_SECRET], [ORG_B_CONVERSATION_SECRET])
    ).toMatchObject({ allowedPresent: true, foreignLeak: false });
    expect(
      inspectAiContextIsolation(bCtx, [ORG_B_CONVERSATION_SECRET], [ORG_A_CONVERSATION_SECRET])
    ).toMatchObject({ allowedPresent: true, foreignLeak: false });
  });
});

describe('Phase 6 — CMS isolation helper (not wired into coach-chat)', () => {
  const articles = [
    {
      org_id: orgA,
      status: 'approved',
      active: true,
      body_markdown: ORG_A_CMS_SECRET,
      title: 'A',
    },
    {
      org_id: orgB,
      status: 'approved',
      active: true,
      body_markdown: ORG_B_CMS_SECRET,
      title: 'B',
    },
    {
      org_id: orgA,
      status: 'draft',
      active: true,
      body_markdown: 'draft-a',
      title: 'draft',
    },
  ];

  it('A sees only approved A CMS; never B', () => {
    const a = filterCmsArticlesForOrgAi(articles, orgA);
    expect(a).toHaveLength(1);
    expect(a[0].body_markdown).toBe(ORG_A_CMS_SECRET);
    expect(a.some((x) => x.body_markdown.includes(ORG_B_CMS_SECRET))).toBe(false);
  });

  it('B sees only approved B CMS; never A', () => {
    const b = filterCmsArticlesForOrgAi(articles, orgB);
    expect(b).toHaveLength(1);
    expect(b[0].body_markdown).toBe(ORG_B_CMS_SECRET);
  });
});

describe('Phase 6 — prompt assembly + AI context inspection', () => {
  it('rejects foreign knowledge / conversation blocks', () => {
    const bad = assembleTenantSafePrompt(orgA, [
      { kind: 'platform', orgId: null, text: 'AscendOS rules' },
      { kind: 'knowledge', orgId: orgB, text: ORG_B_SECRET },
    ]);
    expect(bad).toEqual({
      ok: false,
      error: 'foreign_block',
      foreignKind: 'knowledge',
    });
  });

  it('A prompt contains A secret and never B secret', () => {
    const assembled = assembleTenantSafePrompt(orgA, [
      { kind: 'platform', orgId: null, text: 'Platform safety' },
      { kind: 'organization', orgId: orgA, text: 'Org A agent' },
      { kind: 'knowledge', orgId: orgA, text: ORG_A_SECRET },
      { kind: 'conversation', orgId: orgA, text: ORG_A_CONVERSATION_SECRET },
    ]);
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    const inspect = inspectAiContextIsolation(
      assembled.prompt,
      [ORG_A_SECRET, ORG_A_CONVERSATION_SECRET],
      [ORG_B_SECRET, ORG_B_CONVERSATION_SECRET, ORG_B_CMS_SECRET]
    );
    expect(inspect.allowedPresent).toBe(true);
    expect(inspect.foreignLeak).toBe(false);
  });

  it('B prompt contains B secret and never A secret', () => {
    const assembled = assembleTenantSafePrompt(orgB, [
      { kind: 'platform', orgId: null, text: 'Platform safety' },
      { kind: 'knowledge', orgId: orgB, text: ORG_B_SECRET },
    ]);
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    const inspect = inspectAiContextIsolation(assembled.prompt, [ORG_B_SECRET], [ORG_A_SECRET]);
    expect(inspect.allowedPresent).toBe(true);
    expect(inspect.foreignLeak).toBe(false);
  });
});

describe('Phase 6 — usage attribution + ingest binding', () => {
  it('usage event org_id follows active org', () => {
    const evt = buildUsageEventOrgAttribution(userAb, orgA, 'coach_message_sent', {
      agent_key: 'knowledge',
    });
    expect(evt.org_id).toBe(orgA);
    expect(evt.org_id).not.toBe(orgB);
  });

  it('ingest rejects foreign body organization_id', () => {
    expect(bindIngestToOrg(orgA, orgB)).toEqual({ ok: false, error: 'org_mismatch' });
    expect(bindIngestToOrg(orgA, undefined)).toEqual({ ok: true, org_id: orgA });
  });
});
