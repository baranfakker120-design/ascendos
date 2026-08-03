import { useEffect, useRef, useState } from 'react';
import { computeRankProgress, rankProgressPercent } from '@shared/lib/rankProgress';
import {
  ENERGY_FLOW_SPEED,
  easeEnergyFill,
  energyGlowPulse,
  seedEnergyParticles,
} from './energyCoreMath';
import './energy-core.css';

export type EnergyCoreSize = 'md' | 'lg';
export type EnergyCoreState = 'idle' | 'filled' | 'max';

export interface EnergyCoreProps {
  ap: number;
  currentThreshold: number;
  nextThreshold: number | null;
  state?: EnergyCoreState;
  size?: EnergyCoreSize;
  showLabel?: boolean;
  nextRankLabel?: string | null;
  className?: string;
}

export function formatEnergyAp(ap: number): string {
  return Math.max(0, Math.floor(ap)).toLocaleString('de-DE');
}

export function resolveEnergyCoreState(
  ratio: number,
  isMaxRank: boolean,
  override?: EnergyCoreState
): EnergyCoreState {
  if (override) return override;
  if (isMaxRank) return 'max';
  if (ratio > 0) return 'filled';
  return 'idle';
}

/**
 * AAA Fluid Energy Bar — lebendige Energiezelle (Plasma / Liquid Metal).
 */
export function EnergyCore({
  ap,
  currentThreshold,
  nextThreshold,
  state: stateOverride,
  size = 'md',
  showLabel = true,
  nextRankLabel = null,
  className = '',
}: EnergyCoreProps) {
  const progress = computeRankProgress({ ap, currentThreshold, nextThreshold });
  const percent = rankProgressPercent(progress);
  const state = resolveEnergyCoreState(progress.ratio, progress.isMaxRank, stateOverride);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fillRef = useRef(progress.ratio);
  const glowAtRef = useRef<number | null>(null);
  const prevRatioRef = useRef(progress.ratio);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(
      typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }, []);

  useEffect(() => {
    if (progress.ratio > prevRatioRef.current + 0.002) {
      glowAtRef.current = performance.now();
    }
    prevRatioRef.current = progress.ratio;
  }, [progress.ratio]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const particles = seedEnergyParticles();
    let raf = 0;
    let running = true;
    let last = performance.now();
    let start = last;

    const paint = (now: number) => {
      if (!running) return;
      const dt = Math.min(48, now - last);
      last = now;
      const elapsed = now - start;

      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cw = rect.width;
      const ch = rect.height;

      fillRef.current = reduced
        ? progress.ratio
        : easeEnergyFill(fillRef.current, progress.ratio, dt);
      const fill = Math.max(0.02, fillRef.current);
      const fillW = cw * fill;

      ctx.clearRect(0, 0, cw, ch);

      // Track well
      const r = ch / 2;
      roundRect(ctx, 0, 0, cw, ch, r);
      ctx.fillStyle = 'rgb(17 18 20 / 0.06)';
      ctx.fill();

      if (fillW > 1) {
        ctx.save();
        roundRect(ctx, 0, 0, fillW, ch, r);
        ctx.clip();

        // Liquid metal base
        const flow = reduced ? 0 : elapsed * ENERGY_FLOW_SPEED;
        const g = ctx.createLinearGradient(0, 0, fillW, ch);
        g.addColorStop(0, '#8A6C3C');
        g.addColorStop(0.35 + Math.sin(flow * 8) * 0.04, '#C9A76B');
        g.addColorStop(0.55, '#F0D9A0');
        g.addColorStop(0.78, '#B8935A');
        g.addColorStop(1, '#7A5A2E');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, fillW, ch);

        // Depth shade
        const shade = ctx.createLinearGradient(0, 0, 0, ch);
        shade.addColorStop(0, 'rgb(255 255 255 / 0.28)');
        shade.addColorStop(0.45, 'rgb(255 255 255 / 0)');
        shade.addColorStop(1, 'rgb(40 25 5 / 0.35)');
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, fillW, ch);

        // Flowing caustic bands
        if (!reduced) {
          for (let i = 0; i < 3; i += 1) {
            const phase = flow * (1.2 + i * 0.35) + i * 1.7;
            const bx = ((phase % 1) + 1) % 1;
            const band = ctx.createLinearGradient(bx * fillW - 18, 0, bx * fillW + 18, 0);
            band.addColorStop(0, 'rgb(255 255 255 / 0)');
            band.addColorStop(0.5, `rgb(255 250 230 / ${0.18 + i * 0.04})`);
            band.addColorStop(1, 'rgb(255 255 255 / 0)');
            ctx.fillStyle = band;
            ctx.fillRect(0, 0, fillW, ch);
          }

          // Specular ridge
          ctx.beginPath();
          ctx.ellipse(fillW * 0.35, ch * 0.32, fillW * 0.28, ch * 0.22, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgb(255 255 255 / 0.14)';
          ctx.fill();

          // Light particles
          for (const p of particles) {
            p.x += p.speed * (dt / 1000) * 0.15;
            if (p.x > 0.98) p.x = 0.02;
            const px = p.x * fillW;
            const py = p.y * ch;
            const pr = p.r * (ch / 10);
            const pg = ctx.createRadialGradient(px, py, 0, px, py, pr * 2.2);
            pg.addColorStop(0, `rgb(255 255 255 / ${p.alpha})`);
            pg.addColorStop(1, 'rgb(255 255 255 / 0)');
            ctx.fillStyle = pg;
            ctx.beginPath();
            ctx.arc(px, py, pr * 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Leading meniscus
        const tip = ctx.createLinearGradient(fillW - 10, 0, fillW, 0);
        tip.addColorStop(0, 'rgb(255 255 255 / 0)');
        tip.addColorStop(1, 'rgb(255 250 220 / 0.55)');
        ctx.fillStyle = tip;
        ctx.fillRect(Math.max(0, fillW - 12), 0, 12, ch);

        ctx.restore();

        // Outer glow wave on gain
        const pulse = energyGlowPulse(now, glowAtRef.current);
        if (pulse > 0) {
          ctx.save();
          roundRect(ctx, 0, 0, fillW, ch, r);
          ctx.strokeStyle = `rgb(240 217 160 / ${pulse})`;
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.restore();
        }
      }

      raf = requestAnimationFrame(paint);
    };

    raf = requestAnimationFrame(paint);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [progress.ratio, reduced]);

  const trackHeight = size === 'lg' ? 'h-4' : 'h-3.5';
  const apClass = size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <div className={`energy-core w-full ${className}`}>
      {showLabel ? (
        <div className="mb-2.5 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">AP</p>
            <p className={`font-bold tabular-nums text-ink ${apClass}`}>{formatEnergyAp(ap)}</p>
          </div>
          <div className="min-h-[2.5rem] text-right text-xs text-muted">
            {state === 'max' || progress.isMaxRank ? (
              <span>Höchster Rang erreicht</span>
            ) : (
              <>
                <span className="block">
                  Nächster Rang
                  {nextRankLabel ? `: ${nextRankLabel}` : ''}
                </span>
                <span className="mt-0.5 block tabular-nums">
                  {progress.remainingAp.toLocaleString('de-DE')} AP bis dahin
                </span>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div className={`energy-core__well ${trackHeight}`}>
        <canvas
          ref={canvasRef}
          className="energy-core__canvas"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Fortschritt zum nächsten Rang"
        />
        <div className="energy-core__rim" aria-hidden />
      </div>
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
