import { describe, expect, it } from 'vitest';
import { listOrgSpecialByClass, ORG_SPECIAL_FEATURES } from './orgSpecialFeatures';

describe('Org special features catalog (ADR 0012)', () => {
  it('classifies Radar as D (Org #1 only, not multi-tenant pattern)', () => {
    const radar = ORG_SPECIAL_FEATURES.filter((e) => e.id.startsWith('radar'));
    expect(radar.length).toBeGreaterThan(0);
    expect(radar.every((e) => e.class === 'D')).toBe(true);
  });

  it('keeps branding config as A (organization-neutral)', () => {
    expect(listOrgSpecialByClass('A').some((e) => e.id === 'org-branding-json')).toBe(true);
  });

  it('does not invent Glossily production entries', () => {
    expect(ORG_SPECIAL_FEATURES.every((e) => !/glossily/i.test(e.id + e.note))).toBe(true);
  });
});
