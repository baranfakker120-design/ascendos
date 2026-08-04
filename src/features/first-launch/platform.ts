export type InstallPlatform = 'android' | 'ios' | 'other';

export function detectInstallPlatform(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
): InstallPlatform {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  // iPadOS 13+ may report as Macintosh with touch.
  if (typeof navigator !== 'undefined' && /macintosh/.test(ua) && navigator.maxTouchPoints > 1) {
    return 'ios';
  }
  if (/android/.test(ua)) return 'android';
  return 'other';
}

export function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    // iOS Safari legacy
    const nav = window.navigator as Navigator & { standalone?: boolean };
    return nav.standalone === true;
  } catch {
    return false;
  }
}
