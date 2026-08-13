import { describe, expect, it } from 'vitest';
import { assertPayloadOrgSafe, filterSubscriptionsForOrg } from './pushOrgRecipients';

const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const orgB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const sub = (user_id: string, id = user_id) => ({
  id,
  user_id,
  endpoint: `https://push.test/${user_id}`,
  p256dh: 'p',
  auth: 'a',
});

describe('filterSubscriptionsForOrg (Phase 5 push)', () => {
  it('TEST I: Org A event — user only in Org B → no push', () => {
    const subs = [sub('user-b')];
    const memberships = [{ identity_id: 'user-b', org_id: orgB, status: 'active' }];
    expect(filterSubscriptionsForOrg(subs, memberships, orgA)).toEqual([]);
  });

  it('TEST J: Org A event — user in Org A → push allowed', () => {
    const subs = [sub('user-a')];
    const memberships = [{ identity_id: 'user-a', org_id: orgA, status: 'active' }];
    expect(filterSubscriptionsForOrg(subs, memberships, orgA)).toHaveLength(1);
  });

  it('TEST K: multi-org user A+B receives Org A event only via Org A membership', () => {
    const subs = [sub('user-ab')];
    const memberships = [
      { identity_id: 'user-ab', org_id: orgA, status: 'active' },
      { identity_id: 'user-ab', org_id: orgB, status: 'active' },
    ];
    const forA = filterSubscriptionsForOrg(subs, memberships, orgA);
    expect(forA).toHaveLength(1);
    expect(forA[0].user_id).toBe('user-ab');
  });

  it('inactive membership does not authorize push', () => {
    const subs = [sub('user-a')];
    const memberships = [{ identity_id: 'user-a', org_id: orgA, status: 'inactive' }];
    expect(filterSubscriptionsForOrg(subs, memberships, orgA)).toEqual([]);
  });
});

describe('assertPayloadOrgSafe', () => {
  it('rejects payload advertising foreign org_id', () => {
    expect(assertPayloadOrgSafe({ title: 'x', org_id: orgB }, orgA)).toBe(false);
    expect(assertPayloadOrgSafe({ title: 'x', eventId: 'e1' }, orgA)).toBe(true);
  });
});
