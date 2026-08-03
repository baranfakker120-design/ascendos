import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('rank frame sheen contract', () => {
  const css = readFileSync(join(dir, 'rank-frame.css'), 'utf8');
  const tsx = readFileSync(join(dir, 'RankFrame.tsx'), 'utf8');
  const cssProps = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('mounts a masked sheen host with an animated beam child', () => {
    expect(tsx).toContain('rank-frame-sheen');
    expect(tsx).toContain('rank-frame-sheen-beam');
    expect(tsx).toContain('rank-frame-layer');
    expect(tsx).toMatch(/maskImage:\s*`url\(\$\{frameSrc\}\)`/);
    expect(tsx).toMatch(/WebkitMaskImage:\s*`url\(\$\{frameSrc\}\)`/);
    expect(cssProps).not.toMatch(/::before|::after/);
  });

  it('masks the static host; only the beam transforms (no card leak)', () => {
    expect(cssProps).toMatch(/mask-size:\s*contain/);
    expect(cssProps).toMatch(/mask-mode:\s*alpha/);
    expect(cssProps).toMatch(/-webkit-mask-size:\s*contain/);
    expect(cssProps).toMatch(/overflow:\s*hidden/);
    expect(cssProps).toMatch(/isolation:\s*isolate/);
    expect(cssProps).not.toMatch(/mix-blend-mode|background-blend-mode|backdrop-filter/i);
    // Beam is the only animated transforming layer
    expect(cssProps).toMatch(/\.rank-frame-sheen-beam[\s\S]*will-change:\s*transform,\s*opacity/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it('matches design-sheet timing (6.5s, 45° sweep, pause, reset)', () => {
    expect(css).toMatch(/animation:\s*rank-frame-sheen\s+6\.5s\s+linear\s+infinite/);
    expect(css).toMatch(/rotate\(45deg\)/);
    expect(css).toMatch(/30\.8%/);
    expect(css).toMatch(/53\.8%/);
    expect(css).toMatch(/76\.9%/);
  });

  it('keeps layer order avatar under frame under sheen', () => {
    const avatarIdx = tsx.indexOf('z-[1]');
    const layerIdx = tsx.indexOf('rank-frame-layer');
    expect(avatarIdx).toBeGreaterThan(-1);
    expect(layerIdx).toBeGreaterThan(avatarIdx);
  });
});
