import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTOPILOT_FEED_IMAGE_PROCESSOR,
  FORBIDDEN_IMAGESCRIPT_REMOTE,
  resolveAutopilotFeedImageUrl,
  sourceHasForbiddenImagescriptImport,
} from './feedImagePrepare';

describe('autopilot feed image prepare (Edge worker crash guard)', () => {
  it('uses passthrough processor (no ImageScript boot)', () => {
    expect(AUTOPILOT_FEED_IMAGE_PROCESSOR).toBe('passthrough_no_imagescript');
  });

  it('passthrough returns the signed source URL', () => {
    const url = 'https://example.supabase.co/storage/v1/object/sign/content-assets/x.jpg?token=abc';
    expect(resolveAutopilotFeedImageUrl(url)).toBe(url);
  });

  it('rejects missing feed image URLs', () => {
    expect(() => resolveAutopilotFeedImageUrl('')).toThrow('feed_image_url_missing');
  });

  it('detects the forbidden remote ImageScript specifier', () => {
    expect(
      sourceHasForbiddenImagescriptImport(
        `import { Image } from '${FORBIDDEN_IMAGESCRIPT_REMOTE}';`
      )
    ).toBe(true);
    expect(
      sourceHasForbiddenImagescriptImport("import { handleOptions } from '../_shared/cors.ts';")
    ).toBe(false);
  });

  it('content-autopilot-run source must not statically import deno.land ImageScript', () => {
    const edgePath = resolve(process.cwd(), 'supabase/functions/content-autopilot-run/index.ts');
    const source = readFileSync(edgePath, 'utf8');
    expect(sourceHasForbiddenImagescriptImport(source)).toBe(false);
    expect(source).toMatch(/resolveAutopilotFeedImageUrl/);
    expect(source).not.toMatch(
      /(?:^|\n)\s*import\s+\{[^}]*Image[^}]*\}\s+from\s+['"]https:\/\/deno\.land\/x\/imagescript/
    );
  });
});
