import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('rank frame sheen contract', () => {
  const css = readFileSync(join(dir, 'rank-frame.css'), 'utf8');
  const tsx = readFileSync(join(dir, 'RankFrame.tsx'), 'utf8');
  const cssProps = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('mounts a frame-PNG sheen duplicate (no beam fill that can leak)', () => {
    expect(tsx).toContain('rank-frame-sheen');
    expect(tsx).toContain('rank-frame-sheen-asset');
    expect(tsx).toContain('rank-frame-layer');
    expect(tsx).not.toContain('rank-frame-sheen-beam');
    expect(tsx).not.toMatch(/maskImage|WebkitMaskImage/);
    expect(cssProps).not.toMatch(/::before|::after/);
  });

  it('paints only via frame asset opacity — no mask/blend/gradient beam', () => {
    expect(cssProps).not.toMatch(
      /mask-image|mask-size|mask-mode|-webkit-mask|mix-blend-mode|background-blend-mode|backdrop-filter|linear-gradient/i,
    );
    expect(cssProps).toMatch(/\.rank-frame-sheen-asset/);
    expect(cssProps).toMatch(/overflow:\s*hidden/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it('uses a soft polish pulse with a long rest (not a scanner)', () => {
    expect(css).toMatch(/animation:\s*rank-frame-sheen\s+7s/);
    expect(css).toMatch(/68%/);
    expect(css).toMatch(/82%/);
    expect(css).toMatch(/infinite/);
  });

  it('keeps layer order avatar under frame under sheen', () => {
    const avatarIdx = tsx.indexOf('z-[1]');
    const layerIdx = tsx.indexOf('rank-frame-layer');
    expect(avatarIdx).toBeGreaterThan(-1);
    expect(layerIdx).toBeGreaterThan(avatarIdx);
  });
});
