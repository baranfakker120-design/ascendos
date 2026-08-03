import { useEffect, useRef } from 'react';
import {
  SHEEN_ANGLE_DEG,
  SHEEN_BAND_RATIO,
  SHEEN_CYCLE_MS,
  sheenBandCenter,
  sheenOpacityEnvelope,
  sheenSweepProgress,
} from './frameSheenMath';

export interface FrameSheenCanvasProps {
  frameSrc: string;
  /** CSS pixel size of the frame box. */
  size: number;
}

/**
 * Luxury-watch specular: narrow white band, ~30°, clipped to frame alpha.
 * Canvas destination-in — works on iOS Safari (no mask-image).
 */
export function FrameSheenCanvas({ frameSrc, size }: FrameSheenCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size <= 0) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const img = new Image();
    let raf = 0;
    let start = 0;
    let running = true;

    const paint = (now: number) => {
      if (!running) return;
      if (!start) start = now;
      const elapsed = now - start;
      const progress = sheenSweepProgress(elapsed);

      ctx.clearRect(0, 0, size, size);

      if (progress != null && img.complete && img.naturalWidth > 0) {
        const opacity = sheenOpacityEnvelope(progress);
        const center = sheenBandCenter(progress);
        const band = size * SHEEN_BAND_RATIO;

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.translate(size / 2, size / 2);
        ctx.rotate((SHEEN_ANGLE_DEG * Math.PI) / 180);
        ctx.translate(-size / 2, -size / 2);

        const gx = center * size;
        const grad = ctx.createLinearGradient(gx - band, 0, gx + band, 0);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.42, 'rgba(255,255,255,0.25)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
        grad.addColorStop(0.58, 'rgba(255,255,255,0.25)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(-size, -size, size * 3, size * 3);
        ctx.restore();

        // Keep only pixels where the frame asset is opaque.
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(img, 0, 0, size, size);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(paint);
    };

    const onLoad = () => {
      start = 0;
      raf = requestAnimationFrame(paint);
    };

    img.decoding = 'async';
    img.onload = onLoad;
    img.src = frameSrc;
    if (img.complete && img.naturalWidth > 0) onLoad();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      img.onload = null;
    };
  }, [frameSrc, size]);

  return (
    <canvas
      ref={canvasRef}
      className="rank-frame-sheen-canvas"
      aria-hidden
      // Hint for tests / a11y tooling: cycle length
      data-sheen-cycle-ms={SHEEN_CYCLE_MS}
    />
  );
}
