import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('rank frame sheen contract', () => {
  const css = readFileSync(join(dir, 'rank-frame.css'), 'utf8');
  const tsx = readFileSync(join(dir, 'RankFrame.tsx'), 'utf8');
  const cssProps = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('mounts a real sheen overlay above every rendered frame', () => {
    expect(tsx).toContain('rank-frame-sheen');
    expect(tsx).toContain('rank-frame-layer');
    expect(tsx).toMatch(/showFrame\s*\?/);
    expect(cssProps).not.toMatch(/::before|::after/);
  });

  it('uses translateX/opacity only — no mask, blend, filter, or webkit-mask', () => {
    expect(cssProps).not.toMatch(
      /mask-image|mask-size|mask-mode|-webkit-mask|\bmask\b|mix-blend-mode|background-blend-mode|\bfilter\b/i,
    );
    expect(tsx).not.toMatch(
      /maskImage|WebkitMaskImage|mixBlendMode|backgroundBlendMode|webkitMask/i,
    );
    expect(cssProps).toMatch(/transform:\s*translateX\(/);
    expect(cssProps).toMatch(/overflow:\s*hidden/);
    expect(cssProps).toMatch(/linear-gradient/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it('keeps the luxury timing (10–12s infinite loop)', () => {
    expect(css).toMatch(/animation:\s*rank-frame-sheen\s+11s/);
    expect(css).toMatch(/infinite/);
  });
});
