import { describe, expect, it } from 'vitest';
import { detectInstallPlatform } from './platform';
import { nextStep, prevStep, stepAfterLanguage } from './steps';

describe('detectInstallPlatform', () => {
  it('detects Android', () => {
    expect(detectInstallPlatform('Mozilla/5.0 (Linux; Android 14) Chrome/120')).toBe('android');
  });

  it('detects iPhone', () => {
    expect(detectInstallPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(
      'ios'
    );
  });

  it('detects iPad', () => {
    expect(detectInstallPlatform('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('ios');
  });

  it('falls back to other on desktop', () => {
    expect(detectInstallPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('other');
  });
});

describe('first-launch steps', () => {
  it('routes Android past language into android-1', () => {
    expect(stepAfterLanguage('android', null)).toBe('android-1');
    expect(nextStep('language', 'android', null)).toBe('android-1');
  });

  it('routes iOS past language into ios-1', () => {
    expect(nextStep('language', 'ios', null)).toBe('ios-1');
  });

  it('asks desktop users to pick a platform', () => {
    expect(nextStep('language', 'other', null)).toBe('platform');
    expect(nextStep('platform', 'other', 'ios')).toBe('ios-1');
  });

  it('walks Android guide then advantages', () => {
    expect(nextStep('android-4', 'android', null)).toBe('advantages');
    expect(nextStep('advantages', 'android', null)).toBe('finish');
    expect(prevStep('android-1', 'android', null)).toBe('language');
  });
});
