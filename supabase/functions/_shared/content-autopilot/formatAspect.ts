/**
 * Hard story vs feed aspect gates + metadata crop-risk (Safe-Reject).
 * Edge mirror of client formatAspect. No Autopilot crop / Vision / ImageScript.
 */

export const AUTOPILOT_STORY_ASPECT = '9:16' as const;
export const AUTOPILOT_FEED_ASPECTS = ['1:1', '4:5'] as const;
export const AUTOPILOT_PREFERRED_FEED_ASPECT = '4:5' as const;

export const AUTOPILOT_STORY_CANVAS = { width: 1080, height: 1920 } as const;
export const AUTOPILOT_FEED_CANVAS = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
} as const;

/** Half-canvas floor — below this, Meta-quality risk is too high (Safe-Reject). */
export const AUTOPILOT_STORY_MIN_PX = { width: 540, height: 960 } as const;
export const AUTOPILOT_FEED_MIN_PX = { width: 540, height: 540 } as const;

export type AutopilotSlotKindAspect = 'feed' | 'story';
export type AutopilotCropRisk = 'none' | 'low' | 'medium' | 'high';

export type MediaCompatibility = {
  compatible: boolean;
  sourceRatio: string | null;
  targetRatio: string;
  width: number | null;
  height: number | null;
  cropRisk: AutopilotCropRisk;
  reason: string;
};

export type AssetNotCompatibleDetail = {
  code: 'asset_not_compatible';
  source_ratio: string | null;
  target_ratio: string;
  width: number | null;
  height: number | null;
  crop_risk: AutopilotCropRisk;
  reason: string;
};

export type InsufficientStoryAssetsDetail = {
  code: 'insufficient_story_assets';
  requested: number;
  eligible: number;
  target: typeof AUTOPILOT_STORY_ASPECT;
  reason: string;
};

const FEED_BLOCKED = new Set(['9:16', '16:9', '1.91:1']);
const STORY_BLOCKED = new Set(['1:1', '4:5', '1.91:1', '16:9']);

/** Shared select list — User-Activate and Cron must stay identical. */
export const AUTOPILOT_ELIGIBLE_ASSET_SELECT =
  'id, scope, media_kind, mime_type, storage_path, theme, keywords, suggested_formats, aspect_ratio, width_px, height_px, analysis_status, last_used_at, usage_count, created_at, owner_membership_id' as const;

export function normalizeAspectToken(aspect: string | null | undefined): string | null {
  if (!aspect) return null;
  const token = aspect.trim().replace(/\s+/g, '');
  return token || null;
}

export function targetAspectForSlot(slotKind: AutopilotSlotKindAspect): string {
  return slotKind === 'story' ? AUTOPILOT_STORY_ASPECT : AUTOPILOT_PREFERRED_FEED_ASPECT;
}

function asPositiveInt(n: unknown): number | null {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v);
}

/** Height/width — >1 portrait, <1 landscape. */
export function portraitRatio(
  widthPx: number | null | undefined,
  heightPx: number | null | undefined
): number | null {
  const w = asPositiveInt(widthPx);
  const h = asPositiveInt(heightPx);
  if (!w || !h) return null;
  return h / w;
}

/**
 * Safe-Reject crop risk from metadata only (no Vision, no pixel crop).
 * medium/high → not compatible for Autopilot (no automatic crop).
 */
export function assessMediaCompatibility(params: {
  slotKind: AutopilotSlotKindAspect;
  aspectRatio?: string | null;
  suggestedFormats?: string[] | null;
  widthPx?: number | null;
  heightPx?: number | null;
}): MediaCompatibility {
  const aspect = normalizeAspectToken(params.aspectRatio);
  const formats = (params.suggestedFormats ?? []).map((f) => String(f).toLowerCase());
  const width = asPositiveInt(params.widthPx);
  const height = asPositiveInt(params.heightPx);
  const targetRatio = targetAspectForSlot(params.slotKind);
  const pr = portraitRatio(width, height);

  const base = {
    sourceRatio: aspect,
    targetRatio,
    width,
    height,
  };

  if (params.slotKind === 'story') {
    if (aspect && STORY_BLOCKED.has(aspect)) {
      return {
        ...base,
        compatible: false,
        cropRisk: 'high',
        reason: `story_blocked_aspect_${aspect}`,
      };
    }
    if (width != null && height != null) {
      if (width < AUTOPILOT_STORY_MIN_PX.width || height < AUTOPILOT_STORY_MIN_PX.height) {
        return {
          ...base,
          compatible: false,
          cropRisk: 'high',
          reason: 'story_resolution_too_low',
        };
      }
      if (pr != null && pr < 1.45) {
        return {
          ...base,
          compatible: false,
          cropRisk: 'high',
          reason: 'story_not_portrait_enough_for_9_16',
        };
      }
    }
    if (aspect === AUTOPILOT_STORY_ASPECT) {
      return {
        ...base,
        compatible: true,
        cropRisk: 'none',
        reason: 'exact_9_16',
      };
    }
    if (pr != null && pr >= 1.65 && pr <= 1.9) {
      return {
        ...base,
        compatible: true,
        cropRisk: 'low',
        reason: 'portrait_near_9_16',
      };
    }
    if (!aspect) {
      if (formats.includes('story')) {
        return {
          ...base,
          compatible: true,
          cropRisk: 'low',
          reason: 'unknown_aspect_suggested_story',
        };
      }
      if (formats.length === 0) {
        // Backward-compatible soft allow when metadata never written.
        return {
          ...base,
          compatible: true,
          cropRisk: 'medium',
          reason: 'unknown_aspect_legacy_soft_allow',
        };
      }
      return {
        ...base,
        compatible: false,
        cropRisk: 'high',
        reason: 'unknown_aspect_not_suggested_story',
      };
    }
    // Known "other" / unexpected token: only near-9:16 dims survive (handled above).
    if (formats.includes('story') && pr != null && pr >= 1.55) {
      return {
        ...base,
        compatible: true,
        cropRisk: 'low',
        reason: 'other_portrait_suggested_story',
      };
    }
    return {
      ...base,
      compatible: false,
      cropRisk: 'high',
      reason: 'story_unsafe_without_crop',
    };
  }

  // feed
  if (aspect && FEED_BLOCKED.has(aspect)) {
    return {
      ...base,
      compatible: false,
      cropRisk: 'high',
      reason: `feed_blocked_aspect_${aspect}`,
    };
  }
  if (width != null && height != null) {
    if (width < AUTOPILOT_FEED_MIN_PX.width || height < AUTOPILOT_FEED_MIN_PX.height) {
      return {
        ...base,
        compatible: false,
        cropRisk: 'high',
        reason: 'feed_resolution_too_low',
      };
    }
    if (pr != null && pr >= 1.65) {
      return {
        ...base,
        compatible: false,
        cropRisk: 'high',
        reason: 'feed_too_tall_9_16ish',
      };
    }
    if (pr != null && pr > 0 && pr < 0.75) {
      return {
        ...base,
        compatible: false,
        cropRisk: 'high',
        reason: 'feed_landscape_unsafe_crop',
      };
    }
  }
  if (aspect === '4:5') {
    return { ...base, compatible: true, cropRisk: 'none', reason: 'exact_4_5' };
  }
  if (aspect === '1:1') {
    return { ...base, compatible: true, cropRisk: 'low', reason: 'exact_1_1_feed_ok' };
  }
  if (pr != null && pr >= 1.15 && pr <= 1.35) {
    return { ...base, compatible: true, cropRisk: 'low', reason: 'portrait_near_4_5' };
  }
  if (pr != null && pr >= 0.92 && pr <= 1.08) {
    return { ...base, compatible: true, cropRisk: 'low', reason: 'near_square_feed_ok' };
  }
  if (!aspect) {
    if (formats.includes('feed') || formats.includes('carousel')) {
      return {
        ...base,
        compatible: true,
        cropRisk: 'low',
        reason: 'unknown_aspect_suggested_feed',
      };
    }
    if (formats.length === 0) {
      return {
        ...base,
        compatible: true,
        cropRisk: 'medium',
        reason: 'unknown_aspect_legacy_soft_allow',
      };
    }
    return {
      ...base,
      compatible: false,
      cropRisk: 'high',
      reason: 'unknown_aspect_not_suggested_feed',
    };
  }
  if (
    (formats.includes('feed') || formats.includes('carousel')) &&
    pr != null &&
    pr >= 0.9 &&
    pr <= 1.4
  ) {
    return {
      ...base,
      compatible: true,
      cropRisk: 'low',
      reason: 'other_feedish_suggested_feed',
    };
  }
  return {
    ...base,
    compatible: false,
    cropRisk: 'high',
    reason: 'feed_unsafe_without_crop',
  };
}

/**
 * Safe-Reject gate: medium crop risk is only allowed for legacy soft-allow
 * (unknown aspect, empty formats) so existing libraries are not orphaned.
 * All other medium/high → reject (no Autopilot crop).
 */
export function aspectFitsAutopilotSlot(
  slotKind: AutopilotSlotKindAspect,
  aspectRatio: string | null | undefined,
  suggestedFormats: string[] | null | undefined,
  widthPx?: number | null,
  heightPx?: number | null
): boolean {
  const fit = assessMediaCompatibility({
    slotKind,
    aspectRatio,
    suggestedFormats,
    widthPx,
    heightPx,
  });
  if (!fit.compatible) return false;
  if (fit.cropRisk === 'high') return false;
  if (fit.cropRisk === 'medium' && fit.reason !== 'unknown_aspect_legacy_soft_allow') {
    return false;
  }
  return true;
}

export function buildAssetNotCompatibleDetail(params: {
  slotKind: AutopilotSlotKindAspect;
  aspectRatio?: string | null;
  suggestedFormats?: string[] | null;
  widthPx?: number | null;
  heightPx?: number | null;
}): AssetNotCompatibleDetail {
  const fit = assessMediaCompatibility(params);
  return {
    code: 'asset_not_compatible',
    source_ratio: fit.sourceRatio,
    target_ratio: fit.targetRatio,
    width: fit.width,
    height: fit.height,
    crop_risk: fit.cropRisk,
    reason: fit.reason,
  };
}

export function buildInsufficientStoryAssetsDetail(params: {
  requested: number;
  eligible: number;
}): InsufficientStoryAssetsDetail {
  return {
    code: 'insufficient_story_assets',
    requested: params.requested,
    eligible: params.eligible,
    target: AUTOPILOT_STORY_ASPECT,
    reason:
      params.eligible < params.requested
        ? `Only ${params.eligible} story-safe asset(s) for ${params.requested} requested 9:16 slot(s); refusing to force unsafe crops.`
        : 'No remaining story-safe assets for this slot without reuse/unsafe crop.',
  };
}

/** Score deltas from metadata format fit (applied after eligibility). */
export function mediaFormatScoreDelta(params: {
  slotKind: AutopilotSlotKindAspect;
  aspectRatio?: string | null;
  suggestedFormats?: string[] | null;
  widthPx?: number | null;
  heightPx?: number | null;
}): { delta: number; reasons: string[] } {
  const fit = assessMediaCompatibility(params);
  const reasons: string[] = [];
  let delta = 0;
  const aspect = normalizeAspectToken(params.aspectRatio);
  const width = asPositiveInt(params.widthPx);
  const height = asPositiveInt(params.heightPx);

  if (params.slotKind === 'story') {
    if (aspect === AUTOPILOT_STORY_ASPECT || fit.reason === 'exact_9_16') {
      delta += 28;
      reasons.push('Exaktes 9:16 Story-Format.');
    } else if (fit.cropRisk === 'low') {
      delta += 10;
      reasons.push('Portrait nahe 9:16 (Safe-Reject Crop).');
    } else if (fit.reason === 'unknown_aspect_legacy_soft_allow') {
      delta -= 8;
      reasons.push('Unbekanntes Aspect — Legacy-Soft-Allow, niedriger priorisiert.');
    }
    if (
      width != null &&
      height != null &&
      width >= AUTOPILOT_STORY_CANVAS.width &&
      height >= AUTOPILOT_STORY_CANVAS.height
    ) {
      delta += 12;
      reasons.push('Story-Auflösung ≥ 1080×1920.');
    } else if (
      width != null &&
      height != null &&
      width >= AUTOPILOT_STORY_MIN_PX.width &&
      height >= AUTOPILOT_STORY_MIN_PX.height
    ) {
      delta += 4;
      reasons.push('Story-Auflösung ausreichend.');
    }
  } else {
    if (aspect === '4:5' || fit.reason === 'exact_4_5') {
      delta += 28;
      reasons.push('Exaktes 4:5 Feed-Format (bevorzugt).');
    } else if (aspect === '1:1' || fit.reason === 'exact_1_1_feed_ok') {
      delta += 14;
      reasons.push('1:1 Feed zulässig, 4:5 bevorzugt.');
    } else if (fit.cropRisk === 'low') {
      delta += 8;
      reasons.push('Feed-nahe Proportionen.');
    } else if (fit.reason === 'unknown_aspect_legacy_soft_allow') {
      delta -= 8;
      reasons.push('Unbekanntes Aspect — Legacy-Soft-Allow, niedriger priorisiert.');
    }
    const feedCanvas = AUTOPILOT_FEED_CANVAS['4:5'];
    if (
      width != null &&
      height != null &&
      width >= feedCanvas.width &&
      height >= feedCanvas.height
    ) {
      delta += 12;
      reasons.push('Feed-Auflösung ≥ 1080×1350.');
    } else if (
      width != null &&
      height != null &&
      width >= AUTOPILOT_FEED_MIN_PX.width &&
      height >= AUTOPILOT_FEED_MIN_PX.height
    ) {
      delta += 4;
      reasons.push('Feed-Auflösung ausreichend.');
    }
  }

  if (fit.cropRisk === 'none') {
    delta += 8;
    reasons.push('Kein Crop-Risiko.');
  } else if (fit.cropRisk === 'low') {
    delta += 3;
  }

  return { delta, reasons };
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
