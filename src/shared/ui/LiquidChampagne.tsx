import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  LIQUID_EASE,
  LIQUID_MAX_OFFSET_PX,
  LIQUID_RELEASE_MS,
  clampLiquidOffset,
  easeOutExpo,
  lerpLiquid,
  liquidStretch,
} from '@shared/lib/liquidChampagne';

interface LiquidState {
  visible: boolean;
  releasing: boolean;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  blur: number;
}

const HIDDEN: LiquidState = {
  visible: false,
  releasing: false,
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 0,
  blur: 10,
};

export interface LiquidChampagneProps {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

/**
 * AscendOS signature: liquid champagne light under the finger.
 * Reusable — wrap any pressable control. GPU: transform / opacity / blur only.
 */
export function LiquidChampagne({ children, className = '', disabled = false }: LiquidChampagneProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const rafRef = useRef<number | null>(null);
  const releaseRafRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const [liquid, setLiquid] = useState<LiquidState>(HIDDEN);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stopRelease = useCallback(() => {
    if (releaseRafRef.current != null) {
      cancelAnimationFrame(releaseRafRef.current);
      releaseRafRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    if (!activeRef.current) return;
    const cur = currentRef.current;
    const tgt = targetRef.current;
    const nx = lerpLiquid(cur.x, tgt.x);
    const ny = lerpLiquid(cur.y, tgt.y);
    const vx = nx - cur.x;
    const vy = ny - cur.y;
    cur.x = nx;
    cur.y = ny;
    cur.vx = vx;
    cur.vy = vy;
    const stretch = liquidStretch(vx, vy);
    setLiquid((prev) => ({
      ...prev,
      visible: true,
      releasing: false,
      x: nx,
      y: ny,
      scaleX: stretch.scaleX,
      scaleY: stretch.scaleY,
      opacity: 0.42,
      blur: 12,
    }));
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const localPoint = (clientX: number, clientY: number) => {
    const el = rootRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const rawX = clientX - (rect.left + rect.width / 2);
    const rawY = clientY - (rect.top + rect.height / 2);
    return clampLiquidOffset(rawX, rawY, LIQUID_MAX_OFFSET_PX);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (disabled || e.button !== 0) return;
    stopRelease();
    const p = localPoint(e.clientX, e.clientY);
    targetRef.current = p;
    currentRef.current = { x: p.x, y: p.y, vx: 0, vy: 0 };
    activeRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setLiquid({
      visible: true,
      releasing: false,
      x: p.x,
      y: p.y,
      scaleX: 1,
      scaleY: 1,
      opacity: 0.48,
      blur: 14,
    });
    stopLoop();
    rafRef.current = requestAnimationFrame(tick);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!activeRef.current) return;
    targetRef.current = localPoint(e.clientX, e.clientY);
  };

  const release = (pointerId: number, currentTarget: HTMLSpanElement) => {
    if (!activeRef.current) return;
    activeRef.current = false;
    stopLoop();
    try {
      currentTarget.releasePointerCapture(pointerId);
    } catch {
      // already released
    }

    const stretch = liquidStretch(currentRef.current.vx, currentRef.current.vy);
    const start = {
      x: currentRef.current.x,
      y: currentRef.current.y,
      scaleX: stretch.scaleX,
      scaleY: stretch.scaleY,
      opacity: 0.42,
      blur: 12,
    };
    const started = performance.now();
    stopRelease();

    const step = (now: number) => {
      const t = Math.min(1, (now - started) / LIQUID_RELEASE_MS);
      const e = easeOutExpo(t);
      setLiquid({
        visible: t < 1,
        releasing: true,
        x: start.x * (1 - e),
        y: start.y * (1 - e),
        scaleX: start.scaleX * (1 - e * 0.85),
        scaleY: start.scaleY * (1 - e * 0.85),
        opacity: start.opacity * (1 - e),
        blur: start.blur + e * 8,
      });
      if (t < 1) {
        releaseRafRef.current = requestAnimationFrame(step);
      } else {
        setLiquid(HIDDEN);
      }
    };
    releaseRafRef.current = requestAnimationFrame(step);
  };

  useEffect(
    () => () => {
      stopLoop();
      stopRelease();
    },
    [stopLoop, stopRelease]
  );

  const style: CSSProperties = {
    transform: `translate3d(${liquid.x}px, ${liquid.y}px, 0) scale(${liquid.scaleX}, ${liquid.scaleY})`,
    opacity: liquid.opacity,
    filter: `blur(${liquid.blur}px)`,
    transition: liquid.releasing ? `opacity ${LIQUID_RELEASE_MS}ms ${LIQUID_EASE}` : undefined,
    willChange: 'transform, opacity, filter',
  };

  return (
    <span
      ref={rootRef}
      className={`relative inline-flex touch-manipulation ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => release(e.pointerId, e.currentTarget)}
      onPointerCancel={(e) => release(e.pointerId, e.currentTarget)}
    >
      {(liquid.visible || liquid.releasing) && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/70"
          style={style}
        />
      )}
      <span className="relative z-[1] inline-flex">{children}</span>
    </span>
  );
}
