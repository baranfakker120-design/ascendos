import { describe, expect, it } from 'vitest';
import type { ExternalTool } from '@shared/types/domain';
import {
  ONBOARDING_DESCRIPTION,
  ONBOARDING_NAME,
  ONBOARDING_URL,
  displayShareTool,
  isProofRequiredShareTool,
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

describe('displayShareTool', () => {
  it('renames WayToMoon to Onboarding and pins http URL', () => {
    const display = displayShareTool(
      tool({
        key: 'waytomoon',
        name: 'WayToMoon',
        description: 'Onboarding für neue Interessenten',
        url: 'https://waytomoon.netlify.app',
      })
    );
    expect(display.name).toBe(ONBOARDING_NAME);
    expect(display.description).toBe(ONBOARDING_DESCRIPTION);
    expect(display.url).toBe(ONBOARDING_URL);
    expect(display.url).toBe('http://waytomoon.netlify.app');
  });

  it('keeps Firmenpräsentation as a separate action', () => {
    const display = displayShareTool(
      tool({
        key: 'presentation',
        name: 'Firmenpräsentation',
        description: 'Präsentation für Interessenten',
        url: 'https://mywaytomoon.netlify.app',
        share_event_type: 'presentation_sent',
        sort_order: 2,
      })
    );
    expect(display.name).toBe('Firmenpräsentation');
    expect(display.key).toBe('presentation');
    expect(display.url).toContain('mywaytomoon');
  });

  it('requires proof for onboarding and presentation only', () => {
    expect(isProofRequiredShareTool(tool({ key: 'waytomoon', name: 'Onboarding' }))).toBe(true);
    expect(
      isProofRequiredShareTool(tool({ key: 'presentation', name: 'Firmenpräsentation' }))
    ).toBe(true);
    expect(isProofRequiredShareTool(tool({ key: 'fitcheck', name: 'Fit Check' }))).toBe(false);
  });
});
