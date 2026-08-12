import { describe, expect, it } from 'vitest';
import { PUSH_SUCCESS_TOAST_MS, resolvePushEnableUiMode } from './pushEnableUi';

describe('live coaching push enable UI mode', () => {
  it('1. not activated → enable CTA visible', () => {
    expect(
      resolvePushEnableUiMode({
        status: 'default',
        successUntilMs: null,
        nowMs: 1_000,
      })
    ).toBe('enable');
    expect(
      resolvePushEnableUiMode({
        status: 'granted_unsubscribed',
        successUntilMs: null,
        nowMs: 1_000,
      })
    ).toBe('enable');
  });

  it('2. successful enable → temporary success toast, then hidden', () => {
    const until = 5_000;
    expect(
      resolvePushEnableUiMode({
        status: 'subscribed',
        successUntilMs: until,
        nowMs: until - 1,
      })
    ).toBe('success_toast');
    expect(
      resolvePushEnableUiMode({
        status: 'subscribed',
        successUntilMs: until,
        nowMs: until,
      })
    ).toBe('hidden');
    expect(PUSH_SUCCESS_TOAST_MS).toBeGreaterThanOrEqual(3000);
    expect(PUSH_SUCCESS_TOAST_MS).toBeLessThanOrEqual(5000);
  });

  it('3. already subscribed on later open → no permanent success card', () => {
    expect(
      resolvePushEnableUiMode({
        status: 'subscribed',
        successUntilMs: null,
        nowMs: Date.now(),
      })
    ).toBe('hidden');
  });

  it('6. permission denied → denied UI retained', () => {
    expect(
      resolvePushEnableUiMode({
        status: 'denied',
        successUntilMs: null,
        nowMs: 1,
      })
    ).toBe('denied');
  });

  it('7. reload / app switch with subscribed → still hidden (no permanent card)', () => {
    expect(
      resolvePushEnableUiMode({
        status: 'subscribed',
        successUntilMs: null,
        nowMs: 99_999,
      })
    ).toBe('hidden');
  });

  it('unsupported and loading stay hidden', () => {
    expect(
      resolvePushEnableUiMode({
        status: 'unsupported',
        successUntilMs: null,
        nowMs: 1,
      })
    ).toBe('hidden');
    expect(
      resolvePushEnableUiMode({
        status: 'loading',
        successUntilMs: null,
        nowMs: 1,
      })
    ).toBe('hidden');
  });

  it('missing vapid still surfaces config hint', () => {
    expect(
      resolvePushEnableUiMode({
        status: 'missing_vapid',
        successUntilMs: null,
        nowMs: 1,
      })
    ).toBe('missing_vapid');
  });
});
