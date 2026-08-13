import { describe, expect, it } from 'vitest';
import { shouldPersistQuery } from './queryPersister';

describe('Phase 8 — org-sensitive query persistence', () => {
  it('allows external-tools and organization-profile roots (keys must include orgId at call site)', () => {
    expect(shouldPersistQuery(['external-tools', 'org-a'])).toBe(true);
    expect(shouldPersistQuery(['organization-profile', 'org-b'])).toBe(true);
  });

  it('rejects unrelated roots', () => {
    expect(shouldPersistQuery(['secrets'])).toBe(false);
  });
});
