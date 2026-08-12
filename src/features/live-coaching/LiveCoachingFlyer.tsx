import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  fallbackFlyerGlowRegions,
  resolveFlyerGlowRegions,
  type FlyerGlowRegion,
} from './flyerFaceRegions';
import './live-coaching.css';

const PARTICLES = [
  { left: '12%', top: '22%', delay: '0s', dur: '7.2s' },
  { left: '78%', top: '18%', delay: '1.1s', dur: '8.4s' },
  { left: '34%', top: '58%', delay: '2.4s', dur: '6.8s' },
  { left: '62%', top: '72%', delay: '0.6s', dur: '9.1s' },
  { left: '88%', top: '44%', delay: '3.2s', dur: '7.6s' },
  { left: '8%', top: '76%', delay: '1.8s', dur: '8.8s' },
] as const;

export function LiveCoachingFlyer({
  src,
  mediaType,
  alt = '',
  className = '',
  placeholder,
}: {
  src: string | null | undefined;
  mediaType: 'image' | 'video';
  alt?: string;
  className?: string;
  placeholder?: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [regions, setRegions] = useState<FlyerGlowRegion[]>(() => fallbackFlyerGlowRegions());
  const [entered, setEntered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [parallax, setParallax] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setEntered(true);
      },
      { threshold: 0.28 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setParallax(0);
      return;
    }
    const el = rootRef.current;
    if (!el) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const mid = window.innerHeight * 0.5;
        const delta = (rect.top + rect.height * 0.5 - mid) / window.innerHeight;
        // Few pixels only.
        setParallax(Math.max(-1, Math.min(1, delta)) * 6);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [reduceMotion]);

  useEffect(() => {
    if (!src || mediaType !== 'image') {
      setRegions(fallbackFlyerGlowRegions());
      return;
    }
    const img = imgRef.current;
    const root = rootRef.current;
    if (!img || !root) return;

    let cancelled = false;
    const run = async () => {
      try {
        if (!img.complete) {
          await new Promise<void>((resolve) => {
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
          });
        }
        if (cancelled || !img.naturalWidth) {
          if (!cancelled) setRegions(fallbackFlyerGlowRegions());
          return;
        }
        const result = await resolveFlyerGlowRegions(src, img, root);
        if (!cancelled) setRegions(result.regions);
      } catch {
        if (!cancelled) setRegions(fallbackFlyerGlowRegions());
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [src, mediaType]);

  if (!src) {
    return (
      <div className={`live-coach-flyer ${className}`.trim()} ref={rootRef}>
        <div className="live-coach-flyer__placeholder">{placeholder}</div>
      </div>
    );
  }

  const rootClass = [
    'live-coach-flyer',
    entered ? 'live-coach-flyer--in' : '',
    pressed ? 'live-coach-flyer--pressed' : '',
    reduceMotion ? 'live-coach-flyer--static' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={rootRef}
      className={rootClass}
      style={
        reduceMotion
          ? undefined
          : ({
              '--lc-flyer-parallax': `${parallax.toFixed(2)}px`,
              '--lc-flyer-parallax-glow': `${(parallax * -0.55).toFixed(2)}px`,
            } as CSSProperties)
      }
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      <div className="live-coach-flyer__stage">
        {mediaType === 'video' ? (
          <video
            className="live-coach-flyer__media"
            src={src}
            muted
            playsInline
            loop
            autoPlay
            controls={false}
          />
        ) : (
          <img ref={imgRef} className="live-coach-flyer__media" src={src} alt={alt} />
        )}

        <div className="live-coach-flyer__fx" aria-hidden>
          <div className="live-coach-flyer__glow-layer">
            {regions.map((r, i) => (
              <span
                key={`${r.left}-${r.top}-${i}`}
                className="live-coach-flyer__person-glow"
                style={{
                  left: `${r.left}%`,
                  top: `${r.top}%`,
                  width: `${r.width}%`,
                  height: `${r.height}%`,
                  ['--lc-glow-i' as string]: String(r.intensity),
                  animationDelay: `${i * 0.55}s`,
                }}
              />
            ))}
          </div>

          <div className="live-coach-flyer__sweep" />

          <div className="live-coach-flyer__particles">
            {PARTICLES.map((p, i) => (
              <span
                key={i}
                className="live-coach-flyer__particle"
                style={{
                  left: p.left,
                  top: p.top,
                  animationDelay: p.delay,
                  animationDuration: p.dur,
                }}
              />
            ))}
          </div>

          <div className="live-coach-flyer__frame" />
        </div>
      </div>
    </div>
  );
}
