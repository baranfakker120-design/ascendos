import type { ExternalTool } from '@shared/types/domain';

/** Canonical onboarding share target (WayToMoon product). */
export const ONBOARDING_TOOL_KEY = 'waytomoon';
export const ONBOARDING_URL = 'http://waytomoon.netlify.app';
export const ONBOARDING_NAME = 'Onboarding';

/** Short card subtitle under "Onboarding teilen". */
export const ONBOARDING_DESCRIPTION = 'Letzter Schritt für neue Berater nach der Registrierung.';

/** Longer purpose copy — shown in the verification sheet, not the card. */
export const ONBOARDING_DETAIL =
  'Hilft neuen Beratern dabei, den Businessplan, die ersten Schritte, alle wichtigen Informationen, sowie den Zugang zur Austauschgruppe und zur Nina-Informationsgruppe zu erhalten.';

export const PRESENTATION_TOOL_KEY = 'presentation';
export const PRESENTATION_NAME = 'Firmenpräsentation';
export const PRESENTATION_DESCRIPTION = 'Business-Präsentation für Interessenten';

/**
 * Visible labels/URLs for share tools — keeps DB keys stable while
 * renaming WayToMoon → Onboarding and pinning the onboarding URL.
 * Onboarding and Firmenpräsentation stay completely separate actions.
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

/** Replace legacy product names in any visible UI string. */
export function renameWayToMoonLabel(text: string): string {
  return text.replace(/MyWayToMoon|WayToMoon/gi, ONBOARDING_NAME);
}
