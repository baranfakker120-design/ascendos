import type { ExternalTool } from '@shared/types/domain';

/** Canonical onboarding share target (WayToMoon product). */
export const ONBOARDING_TOOL_KEY = 'waytomoon';
export const ONBOARDING_URL = 'http://waytomoon.netlify.app';
export const ONBOARDING_NAME = 'Onboarding';
export const ONBOARDING_DESCRIPTION = 'Einfacher Einstieg für neue Interessenten';

const PRESENTATION_TOOL_KEY = 'presentation';

/**
 * Visible labels/URLs for share tools — keeps DB keys stable while
 * renaming WayToMoon → Onboarding and pinning the onboarding URL.
 */
export function displayShareTool(tool: ExternalTool): ExternalTool {
  if (tool.key === ONBOARDING_TOOL_KEY) {
    return {
      ...tool,
      name: ONBOARDING_NAME,
      description: ONBOARDING_DESCRIPTION,
      url: ONBOARDING_URL,
    };
  }
  if (tool.key === PRESENTATION_TOOL_KEY) {
    return {
      ...tool,
      name: tool.name || 'Firmenpräsentation',
      description: tool.description || 'Präsentation für Interessenten',
    };
  }
  return tool;
}

export function displayShareTools(tools: ExternalTool[]): ExternalTool[] {
  return tools.map(displayShareTool);
}

export function isProofRequiredShareTool(tool: ExternalTool): boolean {
  return tool.key === ONBOARDING_TOOL_KEY || tool.key === PRESENTATION_TOOL_KEY;
}
