import { describe, expect, it } from 'vitest';
import {
  buildCoachingMediaObjectPath,
  coachingMediaPathBelongsToOrg,
  resolveDispatchOrgId,
} from './coachingMedia';
import { filterSubscriptionsForOrg } from './pushOrgRecipients';

const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const orgB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('Phase 7 — coaching media path boundary', () => {
  it('builds {org_id}/… paths for uploads', () => {
    const path = buildCoachingMediaObjectPath(orgA, 'user-1', 'flyer.jpg', 1000, 'abc');
    expect(path).toBe(`${orgA}/user-1/1000-abc.jpg`);
    expect(coachingMediaPathBelongsToOrg(path, orgA)).toBe(true);
    expect(coachingMediaPathBelongsToOrg(path, orgB)).toBe(false);
  });

  it('rejects empty org', () => {
    expect(() => buildCoachingMediaObjectPath('', 'u', 'a.png')).toThrow('org_required');
  });

  it('legacy user paths are not treated as org-folder owned', () => {
    expect(coachingMediaPathBelongsToOrg('user-legacy/flyer.jpg', orgA)).toBe(false);
  });
});

describe('Phase 7 — dispatch org consistency', () => {
  it('uses event org; denies outbox/event mismatch', () => {
    expect(resolveDispatchOrgId(orgA, orgA)).toEqual({ ok: true, orgId: orgA });
    expect(resolveDispatchOrgId(orgB, orgA)).toEqual({
      ok: false,
      reason: 'org_mismatch',
    });
    expect(resolveDispatchOrgId(null, orgB)).toEqual({ ok: true, orgId: orgB });
    expect(resolveDispatchOrgId(null, null)).toEqual({
      ok: false,
      reason: 'missing_org',
    });
  });
});

describe('Phase 7 — push recipient matrix', () => {
  const sub = (user_id: string, id = `dev-${user_id}`) => ({
    id,
    user_id,
    endpoint: `https://push.test/${id}`,
    p256dh: 'p',
    auth: 'a',
  });

  const memberships = [
    { identity_id: 'user-a', org_id: orgA, status: 'active' },
    { identity_id: 'user-b', org_id: orgB, status: 'active' },
    { identity_id: 'user-ab', org_id: orgA, status: 'active' },
    { identity_id: 'user-ab', org_id: orgB, status: 'active' },
  ];

  it('Event A → A + AB, never B', () => {
    const subs = [
      sub('user-a'),
      sub('user-b'),
      sub('user-ab', 'ab-phone'),
      sub('user-ab', 'ab-desktop'),
    ];
    const recipients = filterSubscriptionsForOrg(subs, memberships, orgA);
    const users = new Set(recipients.map((r) => r.user_id));
    expect(users.has('user-a')).toBe(true);
    expect(users.has('user-ab')).toBe(true);
    expect(users.has('user-b')).toBe(false);
    expect(recipients.filter((r) => r.user_id === 'user-ab')).toHaveLength(2);
  });

  it('Event B → B + AB, never A', () => {
    const subs = [sub('user-a'), sub('user-b'), sub('user-ab')];
    const recipients = filterSubscriptionsForOrg(subs, memberships, orgB);
    const users = new Set(recipients.map((r) => r.user_id));
    expect(users.has('user-b')).toBe(true);
    expect(users.has('user-ab')).toBe(true);
    expect(users.has('user-a')).toBe(false);
  });
});
