/**
 * Mirror of edge `feedImagePrepare.ts` — Autopilot must not boot ImageScript
 * on Supabase Edge (WORKER_ERROR / brotli WASM load).
 */

export const AUTOPILOT_FEED_IMAGE_PROCESSOR = 'passthrough_no_imagescript' as const;

export const FORBIDDEN_IMAGESCRIPT_REMOTE =
  'https://deno.land/x/imagescript@1.3.0/mod.ts' as const;

export function resolveAutopilotFeedImageUrl(sourceSignedUrl: string): string {
  if (!sourceSignedUrl || typeof sourceSignedUrl !== 'string') {
    throw new Error('feed_image_url_missing');
  }
  return sourceSignedUrl;
}

/** True when source text still has a live ESM import of the crashing remote module. */
export function sourceHasForbiddenImagescriptImport(source: string): boolean {
  // Match real import/export-from only — comments documenting the ban are OK.
  const liveImport =
    /(?:^|\n)\s*(?:import|export)\s+[\s\S]*?\s+from\s+['"]https:\/\/deno\.land\/x\/imagescript@[^'"]+['"]/m;
  return liveImport.test(source);
}
