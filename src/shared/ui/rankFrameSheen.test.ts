import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('rank frame sheen contract', () => {
  const css = readFileSync(join(dir, 'rank-frame.css'), 'utf8');
  const tsx = readFileSync(join(dir, 'RankFrame.tsx'), 'utf8');
  const cssProps = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('mounts sheen as duplicate frame asset above the base frame', () => {
    expect(tsx).toContain('rank-frame-sheen');
    expect(tsx).toContain('rank-frame-sheen-asset');
    expect(tsx).toContain('rank-frame-layer');
    expect(tsx).toMatch(/showFrame\s*\?/);
    expect(cssProps).not.toMatch(/::before|::after/);
  });

  it('uses clip-path/opacity/transform only — no mask-image or blend modes', () => {
    expect(cssProps).not.toMatch(
      /mask-image|mask-size|mask-mode|-webkit-mask|mix-blend-mode|background-blend-mode|\bfilter\b/i,
    );
    expect(tsx).not.toMatch(
      /maskImage|WebkitMaskImage|mixBlendMode|backgroundBlendMode|webkitMask/i,
    );
    expect(cssProps).toMatch(/clip-path:\s*inset/);
    expect(cssProps).toMatch(/overflow:\s*hidden/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it('keeps a slow premium glint (5–7s)', () => {
    expect(css).toMatch(/animation:\s*rank-frame-sheen\s+6\.5s/);
    expect(css).toMatch(/infinite/);
  });

  it('keeps layer order avatar under frame under sheen', () => {
    const avatarIdx = tsx.indexOf('z-[1]');
    const layerIdx = tsx.indexOf('rank-frame-layer');
    expect(avatarIdx).toBeGreaterThan(-1);
    expect(layerIdx).toBeGreaterThan(avatarIdx);
  });
});
