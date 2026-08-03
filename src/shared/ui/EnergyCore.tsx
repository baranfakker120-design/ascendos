import { useEffect, useRef, useState } from 'react';
import { computeRankProgress, rankProgressPercent } from '@shared/lib/rankProgress';
import {
  ENERGY_FLOW_SPEED,
  easeEnergyFill,
  energyChargeBoost,
  energyGlowPulse,
  energyParticleSpeedMul,
  energyTurbulence,
  energyVeinY,
  energyWaveProgress,
  seedEnergyParticles,
  seedEnergyVeins,
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
 * AAA Fluid Energy Bar — Glass + Liquid + Energy cell.
 * Canvas for plasma; CSS glass rim stays GPU-composited.
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
    const veins = seedEnergyVeins();
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
      const dt = Math.min(40, now - last);
      last = now;
      const elapsed = now - start;
      const timeSec = elapsed / 1000;
      const flow = reduced ? 0 : elapsed * ENERGY_FLOW_SPEED;
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

      const fill = Math.max(0.018, fillRef.current);
      const fillW = cw * fill;
      const r = ch / 2;

      ctx.clearRect(0, 0, cw, ch);

      // Glass well depth (empty battery)
      roundRect(ctx, 0, 0, cw, ch, r);
      const wellGrad = ctx.createLinearGradient(0, 0, 0, ch);
      wellGrad.addColorStop(0, 'rgb(17 18 20 / 0.07)');
      wellGrad.addColorStop(0.5, 'rgb(17 18 20 / 0.03)');
      wellGrad.addColorStop(1, 'rgb(17 18 20 / 0.09)');
      ctx.fillStyle = wellGrad;
      ctx.fill();

      if (fillW > 1.5) {
        ctx.save();
        roundRect(ctx, 0, 0, fillW, ch, r);
        ctx.clip();

        // --- Liquid metal / plasma body ---
        const body = ctx.createLinearGradient(0, 0, fillW, ch);
        const wobble = Math.sin(flow * 7) * 0.03;
        body.addColorStop(0, '#6E5228');
        body.addColorStop(0.22 + wobble, '#B8935A');
        body.addColorStop(0.45, '#E8C97A');
        body.addColorStop(0.62 - wobble, '#F5E2B0');
        body.addColorStop(0.82, '#C9A76B');
        body.addColorStop(1, '#7A5A2E');
        ctx.fillStyle = body;
        ctx.fillRect(0, 0, fillW, ch);

        // Depth / refraction layers
        const depth = ctx.createLinearGradient(0, 0, 0, ch);
        depth.addColorStop(0, 'rgb(255 255 255 / 0.34)');
        depth.addColorStop(0.28, 'rgb(255 255 255 / 0.08)');
        depth.addColorStop(0.55, 'rgb(255 255 255 / 0)');
        depth.addColorStop(0.78, 'rgb(60 35 8 / 0.18)');
        depth.addColorStop(1, 'rgb(30 18 4 / 0.42)');
        ctx.fillStyle = depth;
        ctx.fillRect(0, 0, fillW, ch);

        if (!reduced) {
          // Moving caustic bands (refraction)
          for (let i = 0; i < 4; i += 1) {
            const phase = flow * (1.15 + i * 0.4) + i * 1.55;
            const bx = (((phase % 1) + 1) % 1) * fillW;
            const half = 10 + i * 3 + boost * 8;
            const band = ctx.createLinearGradient(bx - half, 0, bx + half, 0);
            const a = 0.1 + i * 0.035 + boost * 0.12;
            band.addColorStop(0, 'rgb(255 255 255 / 0)');
            band.addColorStop(0.5, `rgb(255 248 220 / ${a})`);
            band.addColorStop(1, 'rgb(255 255 255 / 0)');
            ctx.fillStyle = band;
            ctx.fillRect(0, 0, fillW, ch);
          }

          // Light veins (energy filaments)
          for (const vein of veins) {
            ctx.beginPath();
            const steps = Math.max(12, Math.floor(fillW / 8));
            for (let s = 0; s <= steps; s += 1) {
              const x01 = s / steps;
              const x = x01 * fillW;
              const y = energyVeinY(vein, x01, timeSec * (1 + boost * 0.6), boost) * ch;
              if (s === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = `rgb(255 250 230 / ${vein.alpha + boost * 0.2})`;
            ctx.lineWidth = vein.width * (1 + boost * 0.5);
            ctx.lineCap = 'round';
            ctx.stroke();
          }

          // Soft specular oval (glass highlight on liquid)
          const sx = fillW * (0.28 + Math.sin(flow * 3) * 0.04);
          ctx.beginPath();
          ctx.ellipse(sx, ch * 0.28, fillW * 0.32, ch * 0.2, -0.15, 0, Math.PI * 2);
          ctx.fillStyle = 'rgb(255 255 255 / 0.16)';
          ctx.fill();

          // Turbulent micro-flecks near the meniscus
          for (let i = 0; i < 6; i += 1) {
            const fx = fillW * (0.72 + i * 0.04);
            const fy =
              ch *
              (0.35 +
                energyTurbulence(0.8 + i * 0.05, timeSec, i) * 0.2 +
                0.15);
            const fr = 1.2 + (i % 3) * 0.6;
            ctx.beginPath();
            ctx.arc(fx, fy, fr, 0, Math.PI * 2);
            ctx.fillStyle = `rgb(255 255 255 / ${0.08 + boost * 0.1})`;
            ctx.fill();
          }

          // Particles
          for (const p of particles) {
            p.x += p.speed * speedMul * (dt / 1000) * 0.18;
            if (p.x > 0.98) p.x = 0.02;
            const wobbleY = Math.sin(timeSec * 2.2 + p.phase) * 0.06 * (1 + boost);
            const px = p.x * fillW;
            const py = Math.min(0.88, Math.max(0.12, p.y + wobbleY)) * ch;
            const pr = p.r * (ch / 11) * (1 + boost * 0.35);
            const pg = ctx.createRadialGradient(px, py, 0, px, py, pr * 2.4);
            pg.addColorStop(0, `rgb(255 255 255 / ${Math.min(0.95, p.alpha + boost * 0.35)})`);
            pg.addColorStop(0.45, `rgb(255 236 180 / ${p.alpha * 0.45})`);
            pg.addColorStop(1, 'rgb(255 255 255 / 0)');
            ctx.fillStyle = pg;
            ctx.beginPath();
            ctx.arc(px, py, pr * 2.4, 0, Math.PI * 2);
            ctx.fill();
          }

          // Charge wave — light runs through the entire bar
          if (wave != null) {
            const wx = wave * fillW;
            const half = 22 + boost * 16;
            const wg = ctx.createLinearGradient(wx - half, 0, wx + half, 0);
            wg.addColorStop(0, 'rgb(255 255 255 / 0)');
            wg.addColorStop(0.35, `rgb(255 250 220 / ${0.15 + boost * 0.2})`);
            wg.addColorStop(0.5, `rgb(255 255 255 / ${0.55 + boost * 0.25})`);
            wg.addColorStop(0.65, `rgb(255 240 180 / ${0.2 + boost * 0.15})`);
            wg.addColorStop(1, 'rgb(255 255 255 / 0)');
            ctx.fillStyle = wg;
            ctx.fillRect(0, 0, fillW, ch);

            // Secondary energy ripple behind the front
            const rx = Math.max(0, wx - 28);
            const rg = ctx.createRadialGradient(rx, ch * 0.5, 0, rx, ch * 0.5, ch * 0.9);
            rg.addColorStop(0, `rgb(255 230 160 / ${0.22 * boost})`);
            rg.addColorStop(1, 'rgb(255 230 160 / 0)');
            ctx.fillStyle = rg;
            ctx.fillRect(0, 0, fillW, ch);
          }
        }

        // Leading meniscus (liquid edge)
        const tip = ctx.createLinearGradient(fillW - 14, 0, fillW + 2, 0);
        tip.addColorStop(0, 'rgb(255 255 255 / 0)');
        tip.addColorStop(0.55, 'rgb(255 248 210 / 0.35)');
        tip.addColorStop(1, 'rgb(255 255 255 / 0.7)');
        ctx.fillStyle = tip;
        ctx.fillRect(Math.max(0, fillW - 16), 0, 18, ch);

        ctx.restore();

        // Outer charge halo (outside clip)
        const pulse = energyGlowPulse(now, glowAtRef.current);
        if (pulse > 0) {
          ctx.save();
          roundRect(ctx, 0, 0, fillW, ch, r);
          ctx.strokeStyle = `rgb(245 226 170 / ${pulse})`;
          ctx.lineWidth = 2.5 + boost * 2;
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

  const trackHeight = size === 'lg' ? 'h-[18px]' : 'h-3.5';
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

      <div ref={wellRef} className={`energy-core__well ${trackHeight}`}>
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
