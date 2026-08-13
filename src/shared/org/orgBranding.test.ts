import { describe, expect, it } from 'vitest';
import {
  assertNoForeignOrgFallback,
  parseOrgBranding,
  resolveCoachDisplayName,
  resolveOnboardingToolUrl,
  resolveOrgDisplayName,
  resolveOrgGuideUrl,
} from './orgBranding';

const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const orgB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('Phase 8 — org branding resolution', () => {
  it('prefers branding.display_name over organizations.name', () => {
    expect(resolveOrgDisplayName('Chogan', { display_name: 'Team Seyda' })).toBe('Team Seyda');
    expect(resolveOrgDisplayName('Test Organization', {})).toBe('Test Organization');
  });

  it('Org A guide from branding; Org B never inherits A URL', () => {
    const brandingA = { guideUrl: 'https://teamseydaguide.netlify.app' };
    const brandingB = { guideUrl: 'https://test-guide.example' };
    expect(resolveOrgGuideUrl(brandingA, [])).toBe('https://teamseydaguide.netlify.app');
    expect(resolveOrgGuideUrl(brandingB, [])).toBe('https://test-guide.example');
    expect(resolveOrgGuideUrl({}, [])).toBeNull();
  });

  it('onboarding URL comes from tools only', () => {
    const toolsA = [{ key: 'waytomoon', url: 'https://waytomoon.netlify.app', is_active: true }];
    const toolsB = [{ key: 'onboarding', url: 'https://test-onboarding.example', is_active: true }];
    expect(resolveOnboardingToolUrl(toolsA)).toBe('https://waytomoon.netlify.app');
    expect(resolveOnboardingToolUrl(toolsB)).toBe('https://test-onboarding.example');
    expect(resolveOnboardingToolUrl([])).toBeNull();
  });

  it('coach display name has no Seyda fallback', () => {
    expect(resolveCoachDisplayName({})).toBeNull();
    expect(resolveCoachDisplayName({ coachDisplayName: 'Seyda' })).toBe('Seyda');
    expect(resolveCoachDisplayName({ coachDisplayName: '  ' })).toBeNull();
  });

  it('rejects foreign Org-1 markers for Org B active context', () => {
    expect(
      assertNoForeignOrgFallback(orgB, 'https://test-guide.example', [
        'teamseydaguide',
        'waytomoon.netlify.app',
      ])
    ).toBe(true);
    expect(
      assertNoForeignOrgFallback(orgB, 'https://teamseydaguide.netlify.app', ['teamseydaguide'])
    ).toBe(false);
    expect(assertNoForeignOrgFallback(orgA, null, ['teamseydaguide'])).toBe(true);
  });

  it('parses branding JSON safely', () => {
    expect(parseOrgBranding({ display_name: 'X', guideUrl: 'https://g' }).display_name).toBe('X');
    expect(parseOrgBranding(null)).toEqual({});
    expect(parseOrgBranding('bad')).toEqual({});
  });
});
