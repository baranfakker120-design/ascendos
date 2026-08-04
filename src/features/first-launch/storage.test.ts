import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FIRST_LAUNCH_STATE,
  markFirstLaunchComplete,
  readFirstLaunchState,
  shouldAutoShowFirstLaunch,
  writeFirstLaunchState,
} from './storage';

const store = new Map<string, string>();

afterEach(() => {
  store.clear();
  vi.unstubAllGlobals();
});

function stubStorage() {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  });
}

describe('first-launch storage', () => {
  it('defaults to incomplete welcome', () => {
    stubStorage();
    expect(readFirstLaunchState()).toEqual(DEFAULT_FIRST_LAUNCH_STATE);
  });

  it('persists step across reads', () => {
    stubStorage();
    writeFirstLaunchState({ completed: false, completedAt: null, step: 'android-2' });
    expect(readFirstLaunchState().step).toBe('android-2');
  });

  it('marks completion and never auto-shows again', () => {
    stubStorage();
    const next = markFirstLaunchComplete();
    expect(next.completed).toBe(true);
    expect(next.completedAt).toBeTruthy();
    expect(shouldAutoShowFirstLaunch(next, false)).toBe(false);
  });

  it('skips auto-show in standalone even if incomplete', () => {
    expect(shouldAutoShowFirstLaunch(DEFAULT_FIRST_LAUNCH_STATE, true)).toBe(false);
    expect(shouldAutoShowFirstLaunch(DEFAULT_FIRST_LAUNCH_STATE, false)).toBe(true);
  });

  it('ignores corrupt localStorage', () => {
    stubStorage();
    store.set('ascendos.first-launch.v1', '{not-json');
    expect(readFirstLaunchState()).toEqual(DEFAULT_FIRST_LAUNCH_STATE);
  });
});
