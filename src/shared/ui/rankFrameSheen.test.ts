import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('rank frame sheen contract', () => {
  const css = readFileSync(join(dir, 'rank-frame.css'), 'utf8');
  const tsx = readFileSync(join(dir, 'RankFrame.tsx'), 'utf8');
  const cssProps = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('uses a brightened frame-PNG duplicate — not CSS mask-image (iOS)', () => {
    expect(tsx).toContain('rank-frame-sheen-asset');
    expect(tsx).not.toMatch(/maskImage|WebkitMaskImage/);
    expect(cssProps).not.toMatch(/mask-image|mask-mode|-webkit-mask/i);
    expect(cssProps).toMatch(/filter:\s*brightness/);
    expect(cssProps).toMatch(/clip-path:\s*ellipse/);
  });

  it('keeps continuous soft metal specular without rest / scanner bar', () => {
    expect(css).toMatch(/animation:[\s\S]*rank-frame-metal-primary/);
    expect(css).toMatch(/rank-frame-metal-secondary/);
    expect(css).toMatch(/rank-frame-metal-breathe/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    // No long idle rest keyed as the old laser sweep
    expect(css).not.toMatch(/62%/);
    expect(css).not.toMatch(/83%/);
    expect(css).not.toMatch(/rank-frame-sheen\s+7s/);
    expect(cssProps).not.toMatch(/clip-path:\s*polygon/);
  });

  it('renders dual specular lobes on frame pixels only', () => {
    expect(tsx).toContain('rank-frame-sheen-asset--secondary');
    const sheenCount = (tsx.match(/rank-frame-sheen-asset/g) ?? []).length;
    expect(sheenCount).toBeGreaterThanOrEqual(2);
  });

  it('keeps layer order avatar under frame under sheen', () => {
    const avatarIdx = tsx.indexOf('z-[1]');
    const layerIdx = tsx.indexOf('rank-frame-layer');
    expect(avatarIdx).toBeGreaterThan(-1);
    expect(layerIdx).toBeGreaterThan(avatarIdx);
  });
});
