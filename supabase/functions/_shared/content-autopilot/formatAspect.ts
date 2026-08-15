/**
 * Hard story vs feed aspect gates for Autopilot (edge mirror of client formatAspect).
 */

export const AUTOPILOT_STORY_ASPECT = '9:16' as const;
export const AUTOPILOT_FEED_ASPECTS = ['1:1', '4:5'] as const;

const FEED_BLOCKED = new Set(['9:16', '16:9']);
const STORY_BLOCKED = new Set(['1:1', '4:5', '1.91:1', '16:9']);

export function aspectFitsAutopilotSlot(
  slotKind: 'feed' | 'story',
  aspectRatio: string | null | undefined,
  suggestedFormats: string[] | null | undefined
): boolean {
  const aspect = aspectRatio?.trim().replace(/\s+/g, '') || null;
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

  if (aspect && (AUTOPILOT_FEED_ASPECTS as readonly string[]).includes(aspect)) return true;
  if (aspect && FEED_BLOCKED.has(aspect)) return false;
  if (!aspect) {
    if (formats.length === 0) return true;
    return formats.includes('feed') || formats.includes('carousel');
  }
  return formats.includes('feed') || formats.includes('carousel');
}
