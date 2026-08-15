/**
 * Hard story vs feed aspect gates for Autopilot (additive).
 * Wrong known aspects are rejected; unknown aspect stays soft via suggested_formats
 * so existing unanalyzed assets are not silently orphaned.
 */

export const AUTOPILOT_STORY_ASPECT = '9:16' as const;
export const AUTOPILOT_FEED_ASPECTS = ['1:1', '4:5'] as const;
export const AUTOPILOT_STORY_CANVAS = { width: 1080, height: 1920 } as const;
export const AUTOPILOT_FEED_CANVAS = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
} as const;

export type AutopilotSlotKindAspect = 'feed' | 'story';

const FEED_BLOCKED = new Set(['9:16', '16:9']);
const STORY_BLOCKED = new Set(['1:1', '4:5', '1.91:1', '16:9']);

export function normalizeAspectToken(aspect: string | null | undefined): string | null {
  if (!aspect) return null;
  const token = aspect.trim().replace(/\s+/g, '');
  return token || null;
}

export function aspectFitsAutopilotSlot(
  slotKind: AutopilotSlotKindAspect,
  aspectRatio: string | null | undefined,
  suggestedFormats: string[] | null | undefined
): boolean {
  const aspect = normalizeAspectToken(aspectRatio);
  const formats = (suggestedFormats ?? []).map((f) => f.toLowerCase());

  if (slotKind === 'story') {
    if (aspect === AUTOPILOT_STORY_ASPECT) return true;
    if (aspect && STORY_BLOCKED.has(aspect)) return false;
    if (!aspect) {
      if (formats.length === 0) return true;
      return formats.includes('story');
    }
    return formats.includes('story');
  }

  // feed
  if (aspect && (AUTOPILOT_FEED_ASPECTS as readonly string[]).includes(aspect)) return true;
  if (aspect && FEED_BLOCKED.has(aspect)) return false;
  if (!aspect) {
    if (formats.length === 0) return true;
    return formats.includes('feed') || formats.includes('carousel');
  }
  return formats.includes('feed') || formats.includes('carousel');
}

export function canvasForAutopilotSlot(
  slotKind: AutopilotSlotKindAspect,
  preferredFeedAspect: '1:1' | '4:5' = '4:5'
): { width: number; height: number; aspect: string } {
  if (slotKind === 'story') {
    return {
      width: AUTOPILOT_STORY_CANVAS.width,
      height: AUTOPILOT_STORY_CANVAS.height,
      aspect: AUTOPILOT_STORY_ASPECT,
    };
  }
  const canvas = AUTOPILOT_FEED_CANVAS[preferredFeedAspect];
  return { width: canvas.width, height: canvas.height, aspect: preferredFeedAspect };
}
