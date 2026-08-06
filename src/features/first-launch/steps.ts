import type { FirstLaunchStep } from './storage';
import type { InstallPlatform } from './platform';

export const ONBOARDING_LOCALES = ['de', 'tr', 'en', 'fr', 'it', 'pl'] as const;

export type GuideFamily = 'android' | 'ios';

const ANDROID_STEPS: FirstLaunchStep[] = ['android-1', 'android-2', 'android-3', 'android-4'];
const IOS_STEPS: FirstLaunchStep[] = ['ios-1', 'ios-2', 'ios-3', 'ios-4', 'ios-5'];

export function installStepsFor(platform: GuideFamily): FirstLaunchStep[] {
  return platform === 'android' ? ANDROID_STEPS : IOS_STEPS;
}

export function firstInstallStep(platform: GuideFamily): FirstLaunchStep {
  return installStepsFor(platform)[0];
}

export function guideFamilyFromStep(step: FirstLaunchStep): GuideFamily | null {
  if (step.startsWith('android-')) return 'android';
  if (step.startsWith('ios-')) return 'ios';
  return null;
}

export function installProgress(step: FirstLaunchStep): { current: number; total: number } | null {
  const family = guideFamilyFromStep(step);
  if (!family) return null;
  const steps = installStepsFor(family);
  const idx = steps.indexOf(step);
  if (idx < 0) return null;
  return { current: idx + 1, total: steps.length };
}

export function resolveGuideFamily(
  platform: InstallPlatform,
  override: GuideFamily | null
): GuideFamily {
  if (override) return override;
  if (platform === 'ios') return 'ios';
  return 'android';
}

/** After language: detected mobile → install steps; desktop/other → platform picker. */
export function stepAfterLanguage(
  platform: InstallPlatform,
  override: GuideFamily | null
): FirstLaunchStep {
  if (platform === 'other' && !override) return 'platform';
  return firstInstallStep(resolveGuideFamily(platform, override));
}

export function nextStep(
  step: FirstLaunchStep,
  platform: InstallPlatform,
  override: GuideFamily | null
): FirstLaunchStep | null {
  if (step === 'welcome') return 'language';
  if (step === 'language') return stepAfterLanguage(platform, override);
  if (step === 'platform') {
    if (!override) return 'platform';
    return firstInstallStep(override);
  }
  const family = guideFamilyFromStep(step);
  if (family) {
    const steps = installStepsFor(family);
    const idx = steps.indexOf(step);
    if (idx >= 0 && idx < steps.length - 1) return steps[idx + 1];
    return 'advantages';
  }
  if (step === 'advantages') return 'finish';
  return null;
}

export function prevStep(
  step: FirstLaunchStep,
  platform: InstallPlatform,
  override: GuideFamily | null
): FirstLaunchStep | null {
  if (step === 'welcome') return null;
  if (step === 'language') return 'welcome';
  if (step === 'platform') return 'language';
  const family = guideFamilyFromStep(step);
  if (family) {
    const steps = installStepsFor(family);
    const idx = steps.indexOf(step);
    if (idx > 0) return steps[idx - 1];
    if (platform === 'other') return 'platform';
    return 'language';
  }
  if (step === 'advantages') {
    const f = resolveGuideFamily(platform, override);
    const steps = installStepsFor(f);
    return steps[steps.length - 1];
  }
  if (step === 'finish') return 'advantages';
  return null;
}
