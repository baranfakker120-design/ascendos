import { useEffect, useState } from 'react';
import { Avatar } from './Avatar';
import {
  frameAvatarLayout,
  resolveFrameSrc,
  resolveFrameSrcSet,
  type FrameDisplaySize,
} from '@shared/lib/frameAssets';
import './rank-frame.css';

export interface RankFrameProps {
  /**
   * Anzuzeigender Rahmen-Schlüssel (AP-Rang oder Sonderrahmen).
   * Aufrufer: resolveDisplayFrameKey() — RankFrame selbst kennt keine Rollen.
   * z. B. "frame-01" … "frame-10". null = nur Placeholder-Ring.
   */
  frameKey?: string | null;
  /** Avatar-Bild-URL. */
  src?: string | null;
  /** Name für Initialen und alt. */
  name: string;
  /** Anzeigegröße des Gesamtrahmens. */
  size?: FrameDisplaySize;
  className?: string;
}

/**
 * Avatar mit optionalem Rangrahmen.
 *
 * Layer: 1) Profilbild  2) Rahmen  3) Glanz (maskiert auf Rahmen-Alpha).
 * Avatar füllt 84–86 % der inneren Kreisfläche; Rahmengröße bleibt fix.
 */
export function RankFrame({
  frameKey = null,
  src,
  name,
  size = 'lg',
  className = '',
}: RankFrameProps) {
  const [frameFailed, setFrameFailed] = useState(false);
  const [dpr, setDpr] = useState(1);

  useEffect(() => {
    const sync = () => setDpr(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    sync();
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  const { box, avatarPx, offsetY } = frameAvatarLayout(frameKey, size);
  const frameSrc = resolveFrameSrc(frameKey, size, dpr);
  const frameSrcSet = resolveFrameSrcSet(frameKey);
  const showFrame = !!frameSrc && !frameFailed;

  useEffect(() => {
    setFrameFailed(false);
  }, [frameSrc]);

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: box, height: box }}
    >
      {!showFrame ? (
        <div className="absolute inset-0 rounded-full border-2 border-accent/50" aria-hidden />
      ) : null}

      {/* 1) Profilbild — unter dem Rahmen, cover, zentriert */}
      <div
        className="absolute z-[1] flex items-center justify-center overflow-hidden rounded-full bg-transparent"
        style={{
          width: avatarPx,
          height: avatarPx,
          left: '50%',
          top: '50%',
          transform: `translate(-50%, calc(-50% + ${offsetY}px))`,
        }}
      >
        <Avatar
          src={src}
          name={name}
          pixelSize={avatarPx}
          className="!bg-transparent"
          imgProps={{
            decoding: 'async',
            draggable: false,
            style: { objectFit: 'cover', objectPosition: 'center' },
          }}
        />
      </div>

      {/* 2) Rahmen + 3) Glanz — Maske = Frame-Alpha, Beam nur dort sichtbar */}
      {showFrame ? (
        <div className="rank-frame-layer">
          <img
            src={frameSrc}
            srcSet={frameSrcSet ?? undefined}
            sizes={`${box}px`}
            alt=""
            aria-hidden
            className="rank-frame-asset"
            draggable={false}
            decoding="async"
            onError={() => setFrameFailed(true)}
          />
          <div
            className="rank-frame-sheen"
            aria-hidden
            style={{
              maskImage: `url(${frameSrc})`,
              WebkitMaskImage: `url(${frameSrc})`,
            }}
          >
            <div className="rank-frame-sheen-beam" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
