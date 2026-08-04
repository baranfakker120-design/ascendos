/**
 * Prefer Zoom native scheme when possible; always keep https fallback.
 * Browsers cannot reliably detect "Zoom installed" — open zoomus:// and
 * fall back to the https URL in the same gesture.
 */

export function toZoomAppScheme(zoomUrl: string): string | null {
  try {
    const u = new URL(zoomUrl);
    if (!/zoom\.us$/i.test(u.hostname) && !/\.zoom\.us$/i.test(u.hostname)) return null;
    const confno = u.pathname.match(/\/j\/(\d+)/)?.[1];
    if (!confno) return null;
    const pwd = u.searchParams.get('pwd');
    const qs = pwd ? `&pwd=${encodeURIComponent(pwd)}` : '';
    return `zoomus://zoom.us/join?confno=${confno}${qs}`;
  } catch {
    return null;
  }
}

export function openZoomJoin(zoomUrl: string): void {
  if (typeof window === 'undefined') return;
  const scheme = toZoomAppScheme(zoomUrl);
  if (scheme) {
    // Attempt app handoff; keep browser tab as fallback.
    const fallbackTimer = window.setTimeout(() => {
      window.open(zoomUrl, '_blank', 'noopener,noreferrer');
    }, 1200);
    window.location.href = scheme;
    window.setTimeout(() => window.clearTimeout(fallbackTimer), 1500);
    return;
  }
  window.open(zoomUrl, '_blank', 'noopener,noreferrer');
}
