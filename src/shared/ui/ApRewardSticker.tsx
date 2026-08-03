import { useEffect, useRef } from 'react';
import { formatApBadgeValue } from './ApBadge';
import { rewardMarkGlyph } from '@shared/lib/apScoring';
import './ap-reward-sticker.css';

export type ApRewardStickerSize = 'sm' | 'md' | 'lg';

export interface ApRewardStickerProps {
  ap: number;
  size?: ApRewardStickerSize;
  mark?: string;
  animate?: boolean;
  className?: string;
}

/** High-tier collectibles get ambient light particles (≥250). */
export function isHighTierReward(ap: number): boolean {
  return Math.trunc(ap) >= 250;
}

export function rewardTierClass(ap: number): string {
  const v = Math.trunc(ap);
  if (v >= 1000) return 'ap-reward-sticker--mythic';
  if (v >= 500) return 'ap-reward-sticker--legendary';
  if (v >= 250) return 'ap-reward-sticker--epic';
  if (v >= 100) return 'ap-reward-sticker--rare';
  return 'ap-reward-sticker--common';
}

/**
 * Collectible reward chip — Clash/Brawl-grade gold + glass + metal.
 */
export function ApRewardSticker({
  ap,
  size = 'md',
  mark,
  animate = true,
  className = '',
}: ApRewardStickerProps) {
  const value = Math.max(0, Math.trunc(ap));
  const glyph = mark ?? rewardMarkGlyph(value);
  const label = `+${formatApBadgeValue(value)} AP`;
  const high = isHighTierReward(value);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!high) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const particles = Array.from({ length: value >= 1000 ? 16 : value >= 500 ? 12 : 9 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.7 + Math.random() * 1.4,
      vx: (Math.random() - 0.5) * 0.1,
      vy: -0.05 - Math.random() * 0.1,
      a: 0.4 + Math.random() * 0.5,
      life: Math.random(),
    }));

    let raf = 0;
    let running = true;
    let last = performance.now();

    const paint = (now: number) => {
      if (!running) return;
      const dt = Math.min(40, now - last) / 1000;
      last = now;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 1 || h < 1) {
        raf = requestAnimationFrame(paint);
        return;
      }
      const bw = Math.round(w * dpr);
      const bh = Math.round(h * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life += dt * 0.35;
        if (p.y < -0.05 || p.life > 1) {
          p.x = Math.random();
          p.y = 0.85 + Math.random() * 0.2;
          p.life = 0;
          p.a = 0.35 + Math.random() * 0.45;
        }
        const alpha = p.a * (1 - Math.abs(p.life - 0.5) * 1.4);
        if (alpha <= 0) continue;
        const px = p.x * w;
        const py = p.y * h;
        const g = ctx.createRadialGradient(px, py, 0, px, py, p.r * 3);
        g.addColorStop(0, `rgb(255 250 210 / ${alpha})`);
        g.addColorStop(1, 'rgb(255 220 120 / 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, p.r * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(paint);
    };

    raf = requestAnimationFrame(paint);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [high, value]);

  return (
    <span
      className={`ap-reward-sticker ap-reward-sticker--${size} ${rewardTierClass(value)} ${animate ? 'ap-reward-sticker--in' : ''} ${className}`}
      role="img"
      aria-label={label}
    >
      <span className="ap-reward-sticker__bevel" aria-hidden />
      <span className="ap-reward-sticker__glow" aria-hidden />
      <span className="ap-reward-sticker__glass" aria-hidden />
      <span className="ap-reward-sticker__sheen" aria-hidden />
      {high ? (
        <canvas ref={canvasRef} className="ap-reward-sticker__particles" aria-hidden />
      ) : null}
      <span className="ap-reward-sticker__mark" aria-hidden>
        {glyph}
      </span>
      <span className="ap-reward-sticker__value" aria-hidden>
        +{formatApBadgeValue(value)}
      </span>
      <span className="ap-reward-sticker__unit" aria-hidden>
        AP
      </span>
    </span>
  );
}
