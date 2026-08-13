/**
 * Autopilot feed image URL prep — Edge-worker safe.
 *
 * Production crash (2026-08-13): top-level
 * `import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts'`
 * loads WASM via fetch+arrayBuffer in zlib.js. On Supabase Edge Runtime that
 * fails with uncaught `TypeError: brotli error` → WORKER_ERROR every cron tick
 * before claim/publish.
 *
 * Autopilot therefore must not boot imagescript in this worker. Pass through
 * the signed source URL; Meta accepts in-range aspect assets (crop/re-encode
 * can return later via a worker-safe codec, not a remote deno.land imagescript boot).
 */

export const AUTOPILOT_FEED_IMAGE_PROCESSOR = 'passthrough_no_imagescript' as const;

/** Forbidden remote ImageScript specifier that crashes Supabase Edge workers. */
export const FORBIDDEN_IMAGESCRIPT_REMOTE =
  'https://deno.land/x/imagescript@1.3.0/mod.ts' as const;

/**
 * Resolve the media URL Autopilot should hand to Instagram Graph.
 * Always passthrough while ImageScript is unsafe on this runtime.
 */
export function resolveAutopilotFeedImageUrl(sourceSignedUrl: string): string {
  if (!sourceSignedUrl || typeof sourceSignedUrl !== 'string') {
    throw new Error('feed_image_url_missing');
  }
  return sourceSignedUrl;
}

/** True when source text still has a live ESM import of the crashing remote module. */
export function sourceHasForbiddenImagescriptImport(source: string): boolean {
  const liveImport =
    /(?:^|\n)\s*(?:import|export)\s+[\s\S]*?\s+from\s+['"]https:\/\/deno\.land\/x\/imagescript@[^'"]+['"]/m;
  return liveImport.test(source);
}
