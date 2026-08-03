import { describe, expect, it } from 'vitest';
import { canManageCoachContent } from './coachContentAuthority';

describe('canManageCoachContent', () => {
  it('allows SuperAdmin and Developer only', () => {
    expect(canManageCoachContent('super_admin')).toBe(true);
    expect(canManageCoachContent('developer')).toBe(true);
    expect(canManageCoachContent('admin')).toBe(false);
    expect(canManageCoachContent('leader')).toBe(false);
    expect(canManageCoachContent('berater')).toBe(false);
    expect(canManageCoachContent(null)).toBe(false);
    expect(canManageCoachContent(undefined)).toBe(false);
  });
});
