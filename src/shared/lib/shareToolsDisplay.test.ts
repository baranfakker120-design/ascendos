/**
 * Visible labels/URLs for share tools — keeps DB keys stable while
 * renaming WayToMoon → Onboarding. URLs always come from external_tools.
 */

import { describe, expect, it } from 'vitest';
import type { ExternalTool } from '@shared/types/domain';
import {
  ONBOARDING_DESCRIPTION,
  ONBOARDING_DETAIL,
  ONBOARDING_NAME,
  PRESENTATION_NAME,
  displayShareTool,
  isOnboardingShareTool,
  isProofRequiredShareTool,
  renameWayToMoonLabel,
} from './shareToolsDisplay';

function tool(partial: Partial<ExternalTool> & Pick<ExternalTool, 'key' | 'name'>): ExternalTool {
  return {
    id: partial.id ?? 't1',
    org_id: partial.org_id ?? 'org',
    key: partial.key,
    name: partial.name,
    description: partial.description ?? null,
    url: partial.url ?? 'https://example.com',
    share_event_type: partial.share_event_type ?? 'waytomoon_sent',
    result_event_type: partial.result_event_type ?? null,
    sort_order: partial.sort_order ?? 1,
    is_active: partial.is_active ?? true,
    created_at: partial.created_at ?? '2026-01-01T00:00:00Z',
  };
}

describe('displayShareTool (Phase 8)', () => {
  it('renames WayToMoon label but keeps org-scoped DB URL', () => {
    const display = displayShareTool(
      tool({
        key: 'waytomoon',
        name: 'WayToMoon',
        description: 'Onboarding für neue Interessenten',
        url: 'https://org-b-onboarding.example/path',
      })
    );
    expect(display.name).toBe(ONBOARDING_NAME);
    expect(display.description).toBe('Onboarding für neue Interessenten');
    expect(ONBOARDING_DETAIL).toContain('Businessplan');
    expect(display.url).toBe('https://org-b-onboarding.example/path');
    expect(display.url).not.toMatch(/waytomoon\.netlify\.app/i);
    expect(isOnboardingShareTool(display)).toBe(true);
  });

  it('does not invent a WayToMoon URL when org has none', () => {
    const display = displayShareTool(
      tool({
        key: 'waytomoon',
        name: 'Onboarding',
        url: 'https://test-org.onboarding.example',
      })
    );
    expect(display.url).toBe('https://test-org.onboarding.example');
  });

  it('keeps Firmenpräsentation as a separate prospect action', () => {
    const display = displayShareTool(
      tool({
        key: 'presentation',
        name: 'Firmenpräsentation',
        description: 'Präsentation für Interessenten',
        url: 'https://org-b-presentation.example',
        share_event_type: 'presentation_sent',
        sort_order: 2,
      })
    );
    expect(display.name).toBe(PRESENTATION_NAME);
    expect(display.key).toBe('presentation');
    expect(display.url).toBe('https://org-b-presentation.example');
    expect(isOnboardingShareTool(display)).toBe(false);
  });

  it('requires proof for onboarding and presentation only', () => {
    expect(isProofRequiredShareTool(tool({ key: 'waytomoon', name: 'Onboarding' }))).toBe(true);
    expect(
      isProofRequiredShareTool(tool({ key: 'presentation', name: 'Firmenpräsentation' }))
    ).toBe(true);
    expect(isProofRequiredShareTool(tool({ key: 'fitcheck', name: 'Fit Check' }))).toBe(false);
  });

  it('renames legacy WayToMoon labels in free text', () => {
    expect(renameWayToMoonLabel('WayToMoon öffnen')).toBe('Onboarding öffnen');
    expect(renameWayToMoonLabel('MyWayToMoon')).toBe('Onboarding');
  });

  it('keeps generic onboarding description constant available', () => {
    expect(ONBOARDING_DESCRIPTION).toContain('Registrierung');
  });
});
