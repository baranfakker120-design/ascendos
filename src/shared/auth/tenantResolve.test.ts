import { describe, expect, it } from 'vitest';
import {
  assertClientOrgMatches,
  buildMatchKnowledgeOrgArgs,
  knowledgeContainsForeignMarker,
  pickActiveMembershipFromList,
} from './tenantResolve';

const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const orgB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const orgC = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function mem(id: string, org_id: string, role = 'berater', status = 'active') {
  return { id, org_id, role, status };
}

describe('pickActiveMembershipFromList (Phase 5)', () => {
  it('TEST A/C: header Org A selects Org A membership', () => {
    const list = [mem('m1', orgA, 'super_admin'), mem('m2', orgB)];
    expect(pickActiveMembershipFromList(list, orgA)?.org_id).toBe(orgA);
  });

  it('TEST B/D: header Org B selects Org B membership', () => {
    const list = [mem('m1', orgA, 'super_admin'), mem('m2', orgB)];
    expect(pickActiveMembershipFromList(list, orgB)?.org_id).toBe(orgB);
  });

  it('TEST E: forged header Org C → deny', () => {
    const list = [mem('m1', orgA), mem('m2', orgB)];
    expect(pickActiveMembershipFromList(list, orgC)).toBeNull();
  });

  it('TEST F: user only in Org B with Org A header → deny', () => {
    const list = [mem('m1', orgB)];
    expect(pickActiveMembershipFromList(list, orgA)).toBeNull();
  });

  it('single membership without header auto-resolves', () => {
    const list = [mem('m1', orgA)];
    expect(pickActiveMembershipFromList(list, null)?.org_id).toBe(orgA);
  });

  it('multi membership without header → deny (Fall 4)', () => {
    const list = [mem('m1', orgA), mem('m2', orgB)];
    expect(pickActiveMembershipFromList(list, null)).toBeNull();
  });

  it('inactive memberships are ignored', () => {
    const list = [mem('m1', orgA, 'berater', 'inactive'), mem('m2', orgB)];
    expect(pickActiveMembershipFromList(list, orgA)).toBeNull();
    expect(pickActiveMembershipFromList(list, null)?.org_id).toBe(orgB);
  });
});

describe('assertClientOrgMatches (ingest)', () => {
  it('TEST H: foreign organization_id denied', () => {
    expect(assertClientOrgMatches(orgB, orgA)).toEqual({
      ok: false,
      error: 'org_mismatch',
    });
  });

  it('TEST G: matching or omitted org allowed', () => {
    expect(assertClientOrgMatches(orgA, orgA)).toEqual({ ok: true });
    expect(assertClientOrgMatches(undefined, orgA)).toEqual({ ok: true });
    expect(assertClientOrgMatches(null, orgA)).toEqual({ ok: true });
  });
});

describe('AI isolation args', () => {
  it('TEST L: match_knowledge p_org_id is server org only', () => {
    expect(buildMatchKnowledgeOrgArgs(orgA)).toEqual({ p_org_id: orgA });
    expect(buildMatchKnowledgeOrgArgs(orgA).p_org_id).not.toBe(orgB);
  });

  it('AI leak markers: Org A context must not contain Org B secret', () => {
    const orgAContext = 'Product guide ORG_A_SECRET_MARKER perfume 129';
    expect(knowledgeContainsForeignMarker(orgAContext, 'ORG_B_SECRET_MARKER')).toBe(false);
    expect(knowledgeContainsForeignMarker(orgAContext, 'ORG_A_SECRET_MARKER')).toBe(true);
  });
});
