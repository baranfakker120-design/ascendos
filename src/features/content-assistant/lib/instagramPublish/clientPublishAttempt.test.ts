import { describe, expect, it, vi } from 'vitest';
import {
  buildClientVideoValidationInput,
  coerceReadableVideoDuration,
  runClientConfirmedPublishAttempt,
  tryAcquireInFlight,
  withInFlightLock,
  type InFlightSlot,
} from './clientPublishAttempt';
import { validateReelAssetForPublish } from './reelVideoValidation';

describe('coerceReadableVideoDuration (Problem 1)', () => {
  it('keeps finite positive durations', () => {
    expect(coerceReadableVideoDuration(12.5)).toBe(12.5);
    expect(coerceReadableVideoDuration(3)).toBe(3);
  });

  it('treats null / undefined as unreadable (no invented value)', () => {
    expect(coerceReadableVideoDuration(null)).toBeNull();
    expect(coerceReadableVideoDuration(undefined)).toBeNull();
  });

  it('treats NaN / Infinity / ≤0 as unreadable (no invented value)', () => {
    expect(coerceReadableVideoDuration(Number.NaN)).toBeNull();
    expect(coerceReadableVideoDuration(Number.POSITIVE_INFINITY)).toBeNull();
    expect(coerceReadableVideoDuration(0)).toBeNull();
    expect(coerceReadableVideoDuration(-1)).toBeNull();
  });
});

describe('buildClientVideoValidationInput — duration optional (Problem 1)', () => {
  const base = {
    mediaKind: 'video' as const,
    format: 'reel' as const,
    mimeType: 'video/mp4',
    byteSize: 1_000_000,
    widthPx: 1080,
    heightPx: 1920,
  };

  it('1) duration successfully read → normal validation (too short fails)', () => {
    const input = buildClientVideoValidationInput({ ...base, rawDurationSec: 2 });
    expect(input.requireDuration).toBe(false);
    expect(input.durationSec).toBe(2);
    expect(validateReelAssetForPublish(input)).toBe('video_too_short');
  });

  it('1b) duration successfully read → valid length passes', () => {
    const input = buildClientVideoValidationInput({ ...base, rawDurationSec: 12 });
    expect(validateReelAssetForPublish(input)).toBe('ok');
  });

  it('2) duration null → no video_not_ready; publish validation ok', () => {
    const input = buildClientVideoValidationInput({ ...base, rawDurationSec: null });
    expect(input.durationSec).toBeUndefined();
    expect(input.requireDuration).toBe(false);
    expect(validateReelAssetForPublish(input)).toBe('ok');
  });

  it('3) duration Infinity/NaN → no artificial duration; validation ok', () => {
    expect(
      validateReelAssetForPublish(
        buildClientVideoValidationInput({ ...base, rawDurationSec: Number.POSITIVE_INFINITY })
      )
    ).toBe('ok');
    expect(
      validateReelAssetForPublish(
        buildClientVideoValidationInput({ ...base, rawDurationSec: Number.NaN })
      )
    ).toBe('ok');
  });
});

describe('in-flight lock (Problem 2)', () => {
  it('acquires synchronously before await work', async () => {
    const slot: InFlightSlot = { current: false };
    let sawLockedDuringAwait = false;
    const outcome = await withInFlightLock(slot, async () => {
      sawLockedDuringAwait = slot.current === true;
      await Promise.resolve();
      return 'ok';
    });
    expect(outcome).toEqual({ acquired: true, result: 'ok' });
    expect(sawLockedDuringAwait).toBe(true);
    expect(slot.current).toBe(false);
  });

  it('4) two near-simultaneous clicks → second blocked by inFlightRef', async () => {
    const slot: InFlightSlot = { current: false };
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const first = withInFlightLock(slot, async () => {
      await gate;
      return 'first';
    });

    // Second attempt while first still holds the lock (before any release).
    expect(tryAcquireInFlight(slot)).toBe(false);
    const second = await runClientConfirmedPublishAttempt({
      inFlight: slot,
      needsVideoCheck: false,
      publish: async () => ({ ok: true }),
    });
    expect(second).toEqual({ status: 'already_in_progress' });

    release();
    await expect(first).resolves.toEqual({ acquired: true, result: 'first' });
    expect(slot.current).toBe(false);
  });

  it('5) error during duration read → lock released', async () => {
    const slot: InFlightSlot = { current: false };
    await expect(
      runClientConfirmedPublishAttempt({
        inFlight: slot,
        needsVideoCheck: true,
        videoValidation: {
          mediaKind: 'video',
          format: 'reel',
          mimeType: 'video/mp4',
        },
        readDuration: async () => {
          throw new Error('duration_read_failed');
        },
        publish: async () => ({ ok: true }),
      })
    ).rejects.toThrow('duration_read_failed');
    expect(slot.current).toBe(false);
  });

  it('6) error during publish → lock released', async () => {
    const slot: InFlightSlot = { current: false };
    await expect(
      runClientConfirmedPublishAttempt({
        inFlight: slot,
        needsVideoCheck: false,
        publish: async () => {
          throw new Error('publish_boom');
        },
      })
    ).rejects.toThrow('publish_boom');
    expect(slot.current).toBe(false);
  });

  it('duration unreadable → publish still runs (no client video_not_ready abort)', async () => {
    const slot: InFlightSlot = { current: false };
    const publish = vi.fn(async () => ({ ok: true as const }));
    const outcome = await runClientConfirmedPublishAttempt({
      inFlight: slot,
      needsVideoCheck: true,
      videoValidation: {
        mediaKind: 'video',
        format: 'reel',
        mimeType: 'video/mp4',
        byteSize: 1_000_000,
        widthPx: 1080,
        heightPx: 1920,
      },
      readDuration: async () => null,
      publish,
    });
    expect(outcome).toEqual({ status: 'published', alreadyPublished: undefined });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(slot.current).toBe(false);
  });

  it('7) feed image path skips video checks (unchanged)', async () => {
    const slot: InFlightSlot = { current: false };
    const readDuration = vi.fn(async () => 99);
    const publish = vi.fn(async () => ({ ok: true as const }));
    const outcome = await runClientConfirmedPublishAttempt({
      inFlight: slot,
      needsVideoCheck: false,
      readDuration,
      publish,
    });
    expect(outcome.status).toBe('published');
    expect(readDuration).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
