/**
 * Phase 8 — share tool display without Org-1 URL hardcodes.
 * DB keys (waytomoon, presentation) stay stable; URLs come from external_tools.
 */

import type { ExternalTool } from '@shared/types/domain';

/** Stable tool key for onboarding share (legacy product key). */
export const ONBOARDING_TOOL_KEY = 'waytomoon';
export const ONBOARDING_NAME = 'Onboarding';

/** Short card subtitle under onboarding share (generic; not org-specific). */
export const ONBOARDING_DESCRIPTION = 'Letzter Schritt für neue Berater nach der Registrierung.';

/** Longer purpose copy — shown in the verification sheet. */
export const ONBOARDING_DETAIL =
  'Hilft neuen Beratern dabei, den Businessplan, die ersten Schritte, alle wichtigen Informationen sowie den Zugang zu Team-Gruppen zu erhalten.';

export const PRESENTATION_TOOL_KEY = 'presentation';
export const PRESENTATION_NAME = 'Firmenpräsentation';
export const PRESENTATION_DESCRIPTION = 'Business-Präsentation für Interessenten';

/**
 * Visible labels for share tools. Never pin a foreign Org-1 URL.
 * Onboarding display name may be neutralized when the DB still says WayToMoon.
 */
export function displayShareTool(tool: ExternalTool): ExternalTool {
  if (tool.key === ONBOARDING_TOOL_KEY) {
    const looksLikeLegacyName = /waytomoon/i.test(tool.name);
    return {
      ...tool,
      name: looksLikeLegacyName || !tool.name.trim() ? ONBOARDING_NAME : tool.name,
      description: tool.description?.trim() || ONBOARDING_DESCRIPTION,
      // URL always from org-scoped external_tools row — never hardcoded.
      url: tool.url,
    };
  }
  if (tool.key === PRESENTATION_TOOL_KEY) {
    return {
      ...tool,
      name: tool.name || PRESENTATION_NAME,
      description: tool.description || PRESENTATION_DESCRIPTION,
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

export function isOnboardingShareTool(tool: ExternalTool): boolean {
  return tool.key === ONBOARDING_TOOL_KEY;
}

/** Sanitize legacy product names in seed/journey copy for display. */
export function renameWayToMoonLabel(text: string): string {
  return text.replace(/MyWayToMoon|WayToMoon/gi, ONBOARDING_NAME);
}
