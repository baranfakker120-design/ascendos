/**
 * Client-side publish helpers for Instagram preview (Phase 5D review fixes).
 * No tokens / no network — orchestration + duration coercion only.
 */

import {
  validateReelAssetForPublish,
  type ReelAssetValidationInput,
  type ReelValidationCode,
} from './reelVideoValidation';

export type InFlightSlot = { current: boolean };

/**
 * Use a browser-read duration only when it is a finite, positive number.
 * null / NaN / Infinity / ≤0 → omit (do not invent a value, do not fail publish).
 */
export function coerceReadableVideoDuration(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return value;
}

/** Build validation input for the client: never requireDuration. */
export function buildClientVideoValidationInput(params: {
  mediaKind: 'image' | 'video';
  format: 'story' | 'feed' | 'reel';
  mimeType?: string | null;
  byteSize?: number | null;
  widthPx?: number | null;
  heightPx?: number | null;
  /** Raw browser duration; non-finite values are ignored. */
  rawDurationSec?: number | null;
}): ReelAssetValidationInput {
  const readable = coerceReadableVideoDuration(params.rawDurationSec);
  return {
    mediaKind: params.mediaKind,
    format: params.format,
    mimeType: params.mimeType,
    byteSize: params.byteSize,
    widthPx: params.widthPx,
    heightPx: params.heightPx,
    ...(readable != null ? { durationSec: readable } : {}),
    requireDuration: false,
  };
}

export function tryAcquireInFlight(slot: InFlightSlot): boolean {
  if (slot.current) return false;
  slot.current = true;
  return true;
}

/**
 * Acquire lock synchronously before any await inside `fn`.
 * Always releases in `finally` (including thrown errors).
 */
export async function withInFlightLock<T>(
  slot: InFlightSlot,
  fn: () => Promise<T>
): Promise<{ acquired: false } | { acquired: true; result: T }> {
  if (!tryAcquireInFlight(slot)) return { acquired: false };
  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    slot.current = false;
  }
}

export type ClientPublishAttemptOutcome =
  | { status: 'already_in_progress' }
  | { status: 'validation_failed'; code: ReelValidationCode }
  | { status: 'published'; alreadyPublished?: boolean }
  | { status: 'publish_failed'; error?: string };

/**
 * Confirmed publish body (after two-tap gate): lock → optional duration → validate → publish.
 * Feed images skip video checks entirely.
 */
export async function runClientConfirmedPublishAttempt(params: {
  inFlight: InFlightSlot;
  mutationPending?: boolean;
  needsVideoCheck: boolean;
  readDuration?: () => Promise<number | null>;
  videoValidation?: Omit<Parameters<typeof buildClientVideoValidationInput>[0], 'rawDurationSec'>;
  publish: () => Promise<{ ok: boolean; alreadyPublished?: boolean; error?: string }>;
}): Promise<ClientPublishAttemptOutcome> {
  if (params.mutationPending) return { status: 'already_in_progress' };

  const locked = await withInFlightLock(params.inFlight, async () => {
    if (params.needsVideoCheck && params.videoValidation) {
      let rawDurationSec: number | null = null;
      if (params.readDuration) {
        rawDurationSec = await params.readDuration();
      }
      const code = validateReelAssetForPublish(
        buildClientVideoValidationInput({
          ...params.videoValidation,
          rawDurationSec,
        })
      );
      if (code !== 'ok') {
        return { status: 'validation_failed' as const, code };
      }
    }

    const result = await params.publish();
    if (result.ok) {
      return {
        status: 'published' as const,
        alreadyPublished: result.alreadyPublished,
      };
    }
    return { status: 'publish_failed' as const, error: result.error };
  });

  if (!locked.acquired) return { status: 'already_in_progress' };
  return locked.result;
}
