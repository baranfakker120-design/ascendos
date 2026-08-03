import { useEffect, useRef, useState } from 'react';
import { computeRankProgress, rankProgressPercent } from '@shared/lib/rankProgress';
import {
  ENERGY_FLOW_SPEED,
  easeEnergyFill,
  energyChargeBoost,
  energyCurrentY,
  energyGlowPulse,
  energyMeniscusOffset,
  energyParticleSpeedMul,
  energyTurbulence,
  energyWaveProgress,
  seedEnergyCaustics,
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
 * AAA battery cell — glass capsule + living liquid energy.
 * Canvas for volume/caustics/wave; CSS for glass lid (GPU).
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
  const wellRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef(progress.ratio);
  const glowAtRef = useRef<number | null>(null);
  const prevRatioRef = useRef(progress.ratio);
  const targetRatioRef = useRef(progress.ratio);
  const [reduced, setReduced] = useState(false);
  const [charging, setCharging] = useState(false);

  useEffect(() => {
    setReduced(
      typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }, []);

  useEffect(() => {
    targetRatioRef.current = progress.ratio;
    if (progress.ratio > prevRatioRef.current + 0.002) {
      glowAtRef.current = performance.now();
      setCharging(true);
      const t = window.setTimeout(() => setCharging(false), 1500);
      return () => window.clearTimeout(t);
    }
    prevRatioRef.current = progress.ratio;
  }, [progress.ratio]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const well = wellRef.current;
    if (!canvas || !well) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const particles = seedEnergyParticles();
    const caustics = seedEnergyCaustics();
    let raf = 0;
    let running = true;
    let last = performance.now();
    let start = last;
    let cssW = 0;
    let cssH = 0;

    const syncSize = () => {
      const rect = well.getBoundingClientRect();
      cssW = rect.width;
      cssH = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(cssW * dpr));
      const h = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncSize) : null;
    ro?.observe(well);
    syncSize();

    const paint = (now: number) => {
      if (!running) return;
      const dt = Math.min(36, now - last);
      last = now;
      const timeSec = (now - start) / 1000;
      const flow = reduced ? 0 : (now - start) * ENERGY_FLOW_SPEED;
      const boost = reduced ? 0 : energyChargeBoost(now, glowAtRef.current);
      const speedMul = energyParticleSpeedMul(boost);
      const wave = reduced ? null : energyWaveProgress(now, glowAtRef.current);

      fillRef.current = reduced
        ? targetRatioRef.current
        : easeEnergyFill(fillRef.current, targetRatioRef.current, dt);

      const cw = cssW;
      const ch = cssH;
      if (cw < 1 || ch < 1) {
        raf = requestAnimationFrame(paint);
        return;
      }

      const fill = Math.max(0.02, fillRef.current);
      const fillW = Math.max(2, cw * fill);
      const r = ch / 2;

      ctx.clearRect(0, 0, cw, ch);

      // Empty glass chamber
      roundRect(ctx, 0, 0, cw, ch, r);
      const chamber = ctx.createLinearGradient(0, 0, 0, ch);
      chamber.addColorStop(0, 'rgb(255 255 255 / 0.35)');
      chamber.addColorStop(0.4, 'rgb(17 18 20 / 0.03)');
      chamber.addColorStop(1, 'rgb(17 18 20 / 0.08)');
      ctx.fillStyle = chamber;
      ctx.fill();

      if (fill > 0.01) {
        ctx.save();
        // Organic liquid silhouette with living meniscus (not a flat cut)
        liquidPath(ctx, fillW, ch, r, timeSec, boost);
        ctx.clip();

        // --- Volumetric plasma body (warm champagne energy) ---
        const body = ctx.createLinearGradient(0, 0, fillW * 0.15, ch);
        const morph = Math.sin(flow * 5.5) * 0.04;
        body.addColorStop(0, '#5C4320');
        body.addColorStop(0.18 + morph, '#9A7340');
        body.addColorStop(0.38, '#D4A85C');
        body.addColorStop(0.52 - morph, '#F2D9A0');
        body.addColorStop(0.68, '#E8C070');
        body.addColorStop(0.85, '#B88948');
        body.addColorStop(1, '#6A4C24');
        ctx.fillStyle = body;
        ctx.fillRect(0, 0, fillW + 8, ch);

        // Internal density — stratified currents (water layers)
        if (!reduced) {
          for (let layer = 0; layer < 3; layer += 1) {
            ctx.beginPath();
            const steps = Math.max(10, Math.floor(fillW / 10));
            for (let s = 0; s <= steps; s += 1) {
              const x01 = s / steps;
              const x = x01 * fillW;
              const y = energyCurrentY(layer, x01, timeSec) * ch;
              if (s === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.lineTo(fillW, ch);
            ctx.lineTo(0, ch);
            ctx.closePath();
            const a = 0.06 + layer * 0.03;
            ctx.fillStyle =
              layer === 1
                ? `rgb(255 245 210 / ${a + boost * 0.06})`
                : `rgb(60 35 8 / ${a * 0.7})`;
            ctx.fill();
          }

          // Caustic light pools (refraction through liquid)
          for (const c of caustics) {
            c.x += c.speed * (1 + boost * 1.5) * (dt / 1000) * 0.12;
            if (c.x > 0.95) c.x = 0.05;
            const wobble =
              energyTurbulence(c.x, timeSec * 0.8, c.phase) * 0.08 * (1 + boost * 0.5);
            const cx = c.x * fillW;
            const cy = Math.min(0.82, Math.max(0.18, c.y + wobble)) * ch;
            const cr = c.r * ch * (1.6 + boost * 0.8);
            const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
            const ca = c.alpha + boost * 0.12;
            cg.addColorStop(0, `rgb(255 252 235 / ${ca * 1.6})`);
            cg.addColorStop(0.35, `rgb(255 230 160 / ${ca})`);
            cg.addColorStop(1, 'rgb(255 220 140 / 0)');
            ctx.fillStyle = cg;
            ctx.beginPath();
            ctx.ellipse(cx, cy, cr * 1.4, cr * 0.55, Math.sin(timeSec + c.phase) * 0.4, 0, Math.PI * 2);
            ctx.fill();
          }

          // Slow surface reflection (top contact with glass)
          const film = ctx.createLinearGradient(0, 0, 0, ch * 0.45);
          film.addColorStop(0, `rgb(255 255 255 / ${0.38 + Math.sin(flow * 4) * 0.06})`);
          film.addColorStop(0.35, 'rgb(255 255 255 / 0.08)');
          film.addColorStop(1, 'rgb(255 255 255 / 0)');
          ctx.fillStyle = film;
          ctx.fillRect(0, 0, fillW + 4, ch * 0.45);

          // Bottom depth / shadow in the capsule
          const deep = ctx.createLinearGradient(0, ch * 0.45, 0, ch);
          deep.addColorStop(0, 'rgb(40 25 5 / 0)');
          deep.addColorStop(1, 'rgb(25 15 4 / 0.45)');
          ctx.fillStyle = deep;
          ctx.fillRect(0, 0, fillW + 4, ch);

          // Specular travelling slowly (glass catch light on liquid)
          const specX = fillW * (0.22 + (Math.sin(flow * 2.2) * 0.5 + 0.5) * 0.35);
          ctx.beginPath();
          ctx.ellipse(specX, ch * 0.26, fillW * 0.22, ch * 0.16, -0.2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgb(255 255 255 / 0.14)';
          ctx.fill();

          // Micro bubbles / energy motes
          for (const p of particles) {
            p.x += p.speed * speedMul * (dt / 1000) * 0.14;
            if (p.x > 0.97) p.x = 0.03;
            const wy = Math.sin(timeSec * p.drift + p.phase) * 0.07 * (1 + boost * 0.6);
            const px = p.x * fillW;
            const py = Math.min(0.86, Math.max(0.14, p.y + wy)) * ch;
            const pr = p.r * (ch / 12) * (1 + boost * 0.4);
            const pg = ctx.createRadialGradient(px, py, 0, px, py, pr * 2.6);
            const pa = Math.min(0.9, p.alpha + boost * 0.3);
            pg.addColorStop(0, `rgb(255 255 255 / ${pa})`);
            pg.addColorStop(0.4, `rgb(255 236 185 / ${pa * 0.4})`);
            pg.addColorStop(1, 'rgb(255 255 255 / 0)');
            ctx.fillStyle = pg;
            ctx.beginPath();
            ctx.arc(px, py, pr * 2.6, 0, Math.PI * 2);
            ctx.fill();
          }

          // Charge energy wave — travels full length, then calm
          if (wave != null) {
            const wx = wave * fillW;
            const half = 28 + boost * 20;
            const wg = ctx.createLinearGradient(wx - half, 0, wx + half, 0);
            wg.addColorStop(0, 'rgb(255 255 255 / 0)');
            wg.addColorStop(0.3, `rgb(255 248 220 / ${0.18 + boost * 0.22})`);
            wg.addColorStop(0.5, `rgb(255 255 255 / ${0.62 + boost * 0.28})`);
            wg.addColorStop(0.7, `rgb(255 230 160 / ${0.22 + boost * 0.18})`);
            wg.addColorStop(1, 'rgb(255 255 255 / 0)');
            ctx.fillStyle = wg;
            ctx.fillRect(0, 0, fillW + 4, ch);

            // Trailing turbulence flecks
            for (let i = 0; i < 5; i += 1) {
              const fx = wx - 12 - i * 10;
              if (fx < 0) continue;
              const fy = ch * (0.3 + ((i * 19) % 40) / 100);
              const fr = 2 + i * 0.4 + boost * 2;
              const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr * 2);
              fg.addColorStop(0, `rgb(255 250 220 / ${0.35 * boost})`);
              fg.addColorStop(1, 'rgb(255 250 220 / 0)');
              ctx.fillStyle = fg;
              ctx.beginPath();
              ctx.arc(fx, fy, fr * 2, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else {
          // Reduced motion: static depth only
          const depth = ctx.createLinearGradient(0, 0, 0, ch);
          depth.addColorStop(0, 'rgb(255 255 255 / 0.28)');
          depth.addColorStop(1, 'rgb(40 25 5 / 0.3)');
          ctx.fillStyle = depth;
          ctx.fillRect(0, 0, fillW, ch);
        }

        ctx.restore();

        // Outer halo during charge
        const pulse = energyGlowPulse(now, glowAtRef.current);
        if (pulse > 0) {
          ctx.save();
          liquidPath(ctx, fillW, ch, r, timeSec, boost);
          ctx.strokeStyle = `rgb(250 230 175 / ${pulse})`;
          ctx.lineWidth = 2 + boost * 2.5;
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
      ro?.disconnect();
    };
  }, [reduced]);

  const trackHeight = size === 'lg' ? 'h-5' : 'h-4';
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

      <div
        ref={wellRef}
        className={`energy-core__well ${trackHeight} ${charging ? 'energy-core__well--charge' : ''}`}
      >
        <canvas
          ref={canvasRef}
          className="energy-core__canvas"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Fortschritt zum nächsten Rang"
        />
        <div className="energy-core__glass" aria-hidden />
        <div className="energy-core__rim" aria-hidden />
      </div>
    </div>
  );
}

/** Capsule clip with living meniscus at the liquid front. */
function liquidPath(
  ctx: CanvasRenderingContext2D,
  fillW: number,
  ch: number,
  r: number,
  timeSec: number,
  boost: number
) {
  const leftR = Math.min(r, fillW / 2);
  ctx.beginPath();
  ctx.moveTo(leftR, 0);
  ctx.lineTo(Math.max(leftR, fillW - 2), 0);
  // Meniscus front (top → bottom)
  const steps = 10;
  for (let i = 0; i <= steps; i += 1) {
    const y01 = i / steps;
    const y = y01 * ch;
    const bulge = energyMeniscusOffset(y01, timeSec, boost) * ch;
    const x = fillW + bulge * 0.55;
    ctx.lineTo(Math.max(leftR, x), y);
  }
  ctx.lineTo(leftR, ch);
  ctx.arcTo(0, ch, 0, 0, leftR);
  ctx.arcTo(0, 0, fillW, 0, leftR);
  ctx.closePath();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rad: number
) {
  const rr = Math.min(rad, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
