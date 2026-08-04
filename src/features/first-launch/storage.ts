export type FirstLaunchStep =
  | 'welcome'
  | 'language'
  | 'platform'
  | 'android-1'
  | 'android-2'
  | 'android-3'
  | 'android-4'
  | 'ios-1'
  | 'ios-2'
  | 'ios-3'
  | 'ios-4'
  | 'ios-5'
  | 'advantages'
  | 'finish';

export type FirstLaunchState = {
  completed: boolean;
  completedAt: string | null;
  step: FirstLaunchStep;
};

const STORAGE_KEY = 'ascendos.first-launch.v1';

export const DEFAULT_FIRST_LAUNCH_STATE: FirstLaunchState = {
  completed: false,
  completedAt: null,
  step: 'welcome',
};

function isStep(value: unknown): value is FirstLaunchStep {
  return (
    value === 'welcome' ||
    value === 'language' ||
    value === 'platform' ||
    value === 'android-1' ||
    value === 'android-2' ||
    value === 'android-3' ||
    value === 'android-4' ||
    value === 'ios-1' ||
    value === 'ios-2' ||
    value === 'ios-3' ||
    value === 'ios-4' ||
    value === 'ios-5' ||
    value === 'advantages' ||
    value === 'finish'
  );
}

export function readFirstLaunchState(): FirstLaunchState {
  if (typeof window === 'undefined') return { ...DEFAULT_FIRST_LAUNCH_STATE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FIRST_LAUNCH_STATE };
    const parsed = JSON.parse(raw) as Partial<FirstLaunchState>;
    return {
      completed: parsed.completed === true,
      completedAt: typeof parsed.completedAt === 'string' ? parsed.completedAt : null,
      step: isStep(parsed.step) ? parsed.step : 'welcome',
    };
  } catch {
    return { ...DEFAULT_FIRST_LAUNCH_STATE };
  }
}

export function writeFirstLaunchState(next: FirstLaunchState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private mode failures.
  }
}

export function markFirstLaunchComplete(state?: FirstLaunchState): FirstLaunchState {
  const next: FirstLaunchState = {
    completed: true,
    completedAt: new Date().toISOString(),
    step: state?.step ?? 'finish',
  };
  writeFirstLaunchState(next);
  return next;
}

export function resetFirstLaunchProgress(): FirstLaunchState {
  const next = { ...DEFAULT_FIRST_LAUNCH_STATE };
  writeFirstLaunchState(next);
  return next;
}

export function shouldAutoShowFirstLaunch(state: FirstLaunchState, isStandalone: boolean): boolean {
  if (state.completed) return false;
  if (isStandalone) return false;
  return true;
}
