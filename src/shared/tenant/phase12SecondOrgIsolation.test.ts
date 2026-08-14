import { describe, expect, it } from 'vitest';
import {
  assertNoForeignOrgFallback,
  resolveCoachDisplayName,
  resolveOnboardingToolUrl,
  resolveOrgDisplayName,
  resolveOrgGuideUrl,
} from '../org/orgBranding';
import { assertClientOrgMatches } from '../auth/tenantResolve';
import { filterSubscriptionsForOrg } from '../../features/live-coaching/pushOrgRecipients';
import {
  collapseAutopilotFeedToSingle,
  isCarouselMode as autopilotIsCarousel,
} from '../../features/content-assistant/lib/autopilot/carouselBundle';
import { CAROUSEL_MAX_SLIDES } from '../../features/content-assistant/lib/carousel/selection';
import { isOrganizationAdminRole } from '../auth/organizationAdminAuthority';
import { isPlatformSuperAdminFlag } from '../auth/platformAdminAuthority';
import {
  FORBIDDEN_ORG_B_FALLBACKS,
  ISOLATION_TEST_ORG_BRANDING,
  ORG_A_ID,
  ORG_A_SECRET_MARKER,
  ORG_B_ID,
  ORG_B_SECRET_MARKER,
  orgBBrandingIsNeutral,
  resolveActiveOrgForUser,
  secretMarkersIsolated,
  storagePathBelongsToOrg,
} from './phase12SecondOrgIsolation';

const memA = {
  id: 'm-a',
  org_id: ORG_A_ID,
  role: 'super_admin',
  status: 'active',
};
const memB = {
  id: 'm-b',
  org_id: ORG_B_ID,
  role: 'berater',
  status: 'active',
};

describe('Phase 12 — second org identity', () => {
  it('Org B branding fixture is Isolation Test Org / Coach B', () => {
    expect(ISOLATION_TEST_ORG_BRANDING.display_name).toBe('Isolation Test Org');
    expect(ISOLATION_TEST_ORG_BRANDING.coachDisplayName).toBe('Coach B');
    expect(resolveOrgDisplayName('AscendOS Isolation Test Org', ISOLATION_TEST_ORG_BRANDING)).toBe(
      'Isolation Test Org'
    );
    expect(resolveCoachDisplayName(ISOLATION_TEST_ORG_BRANDING)).toBe('Coach B');
  });

  it('Org B branding rejects Team Seyda / WayToMoon / Essence Tribe defaults', () => {
    expect(orgBBrandingIsNeutral(ISOLATION_TEST_ORG_BRANDING)).toBe(true);
    expect(
      orgBBrandingIsNeutral({
        display_name: 'Isolation Test Org',
        guideUrl: 'https://teamseydaguide.netlify.app',
      })
    ).toBe(false);
    for (const marker of FORBIDDEN_ORG_B_FALLBACKS) {
      expect(
        assertNoForeignOrgFallback(ORG_B_ID, `https://x.test/${marker}`, [marker])
      ).toBe(false);
    }
  });

  it('Org B tools never fall back to WayToMoon', () => {
    expect(resolveOnboardingToolUrl([])).toBeNull();
    expect(
      resolveOnboardingToolUrl([
        { key: 'onboarding', url: 'https://isolation-tool.test', is_active: true },
      ])
    ).toBe('https://isolation-tool.test');
    expect(resolveOrgGuideUrl(ISOLATION_TEST_ORG_BRANDING, [])).toBe(
      'https://isolation-guide.test'
    );
  });
});

describe('Phase 12 — organization resolution', () => {
  it('User A header A → A; forged B → DENY', () => {
    expect(resolveActiveOrgForUser({ memberships: [memA], header: ORG_A_ID })).toBe(ORG_A_ID);
    expect(resolveActiveOrgForUser({ memberships: [memA], header: ORG_B_ID })).toBeNull();
  });

  it('User B header B → B; forged A → DENY', () => {
    expect(resolveActiveOrgForUser({ memberships: [memB], header: ORG_B_ID })).toBe(ORG_B_ID);
    expect(resolveActiveOrgForUser({ memberships: [memB], header: ORG_A_ID })).toBeNull();
  });

  it('MULTI-ORG: header A/B switch; no header DENY', () => {
    const multi = [memA, memB];
    expect(resolveActiveOrgForUser({ memberships: multi, header: ORG_A_ID })).toBe(ORG_A_ID);
    expect(resolveActiveOrgForUser({ memberships: multi, header: ORG_B_ID })).toBe(ORG_B_ID);
    expect(resolveActiveOrgForUser({ memberships: multi, header: null })).toBeNull();
  });

  it('manipulated body organization_id is rejected', () => {
    expect(assertClientOrgMatches(ORG_B_ID, ORG_A_ID)).toEqual({
      ok: false,
      error: 'org_mismatch',
    });
    expect(assertClientOrgMatches(ORG_A_ID, ORG_A_ID)).toEqual({ ok: true });
  });
});

describe('Phase 12 — knowledge + coach secret markers', () => {
  it('A context never contains ORG_B_SECRET_MARKER and vice versa', () => {
    const a = `Coach A knowledge ${ORG_A_SECRET_MARKER}`;
    const b = `Coach B knowledge ${ORG_B_SECRET_MARKER}`;
    const { aClean, bClean } = secretMarkersIsolated(a, b);
    expect(aClean).toBe(true);
    expect(bClean).toBe(true);
    expect(secretMarkersIsolated(`${a} ${ORG_B_SECRET_MARKER}`, b).aClean).toBe(false);
    expect(secretMarkersIsolated(a, `${b} ${ORG_A_SECRET_MARKER}`).bClean).toBe(false);
  });
});

describe('Phase 12 — push isolation', () => {
  it('A event reaches A-only and multi; never B-only', () => {
    const subs = [
      { id: '1', user_id: 'a', endpoint: 'e1', p256dh: 'p', auth: 'a' },
      { id: '2', user_id: 'b', endpoint: 'e2', p256dh: 'p', auth: 'a' },
      { id: '3', user_id: 'ab', endpoint: 'e3', p256dh: 'p', auth: 'a' },
    ];
    const memberships = [
      { identity_id: 'a', org_id: ORG_A_ID, status: 'active' },
      { identity_id: 'b', org_id: ORG_B_ID, status: 'active' },
      { identity_id: 'ab', org_id: ORG_A_ID, status: 'active' },
      { identity_id: 'ab', org_id: ORG_B_ID, status: 'active' },
    ];
    const forA = filterSubscriptionsForOrg(subs, memberships, ORG_A_ID);
    expect(forA.map((s) => s.user_id).sort()).toEqual(['a', 'ab']);
    const forB = filterSubscriptionsForOrg(subs, memberships, ORG_B_ID);
    expect(forB.map((s) => s.user_id).sort()).toEqual(['ab', 'b']);
  });
});

describe('Phase 12 — admin gates', () => {
  it('Org Admin role is not Platform Admin', () => {
    expect(isOrganizationAdminRole('super_admin')).toBe(true);
    expect(isOrganizationAdminRole('admin')).toBe(true);
    expect(isOrganizationAdminRole('berater')).toBe(false);
    expect(isPlatformSuperAdminFlag(false)).toBe(false);
    expect(isPlatformSuperAdminFlag(true)).toBe(true);
  });
});

describe('Phase 12 — storage + autopilot + carousel invariants', () => {
  it('storage paths are org-prefixed', () => {
    expect(storagePathBelongsToOrg(`${ORG_A_ID}/asset.jpg`, ORG_A_ID)).toBe(true);
    expect(storagePathBelongsToOrg(`${ORG_B_ID}/asset.jpg`, ORG_A_ID)).toBe(false);
  });

  it('Autopilot remains exactly one feed image (never carousel)', () => {
    expect(autopilotIsCarousel(5)).toBe(false);
    const collapsed = collapseAutopilotFeedToSingle({
      assetId: 'a1',
      carouselAssetIds: ['a1', 'a2', 'a3'],
    });
    expect(collapsed.carouselAssetIds).toEqual([]);
    expect(collapsed.isCarousel).toBe(false);
    expect(collapsed.assetId).toBe('a1');
  });

  it('Manual carousel max stays 10 and separate from Autopilot', () => {
    expect(CAROUSEL_MAX_SLIDES).toBe(10);
  });
});
