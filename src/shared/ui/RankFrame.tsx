import { useEffect, useState } from 'react';
import { Avatar } from './Avatar';
import {
  FRAME_DISPLAY_PX,
  getFrameGeometry,
  openingLayout,
  resolveFrameSrc,
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
 * Rahmen-Asset unter /brand/frames/{key}-{px}.webp. Fehlt der Schlüssel
 * oder schlägt das Laden fehl, bleibt ein ruhiger Champagner-Ring —
 * sonst kein Placeholder unter dem echten Rahmen.
 *
 * Premium: langsamer Champagner-Shimmer über dem bestehenden Frame
 * (translateX + opacity, overflow clip). Keine neuen Assets.
 */
export function RankFrame({
  frameKey = null,
  src,
  name,
  size = 'lg',
  className = '',
}: RankFrameProps) {
  const [frameFailed, setFrameFailed] = useState(false);
  const geometry = getFrameGeometry(frameKey);
  const frameSrc = resolveFrameSrc(frameKey, size);
  const showFrame = !!geometry && !!frameSrc && !frameFailed;
  const box = FRAME_DISPLAY_PX[size];
  const layout = geometry ? openingLayout(geometry) : null;

  const openingWidth = layout ? Math.round(box * layout.widthRatio) : Math.round(box * 0.72);
  const openingHeight = layout ? Math.round(box * layout.heightRatio) : Math.round(box * 0.72);
  const offsetY = layout ? Math.round(box * layout.offsetYRatio) : 0;
  const avatarPx = Math.min(openingWidth, openingHeight);

  useEffect(() => {
    setFrameFailed(false);
  }, [frameSrc]);

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: box, height: box }}
    >
      {/* Placeholder nur wenn kein Rahmen-Asset angezeigt wird. */}
      {!showFrame ? (
        <div className="absolute inset-0 rounded-full border-2 border-accent/50" aria-hidden />
      ) : null}

      <div
        className="relative z-[1] flex items-center justify-center overflow-hidden rounded-full"
        style={{
          width: openingWidth,
          height: openingHeight,
          transform: offsetY ? `translateY(${offsetY}px)` : undefined,
        }}
      >
        <Avatar src={src} name={name} pixelSize={avatarPx} />
      </div>

      {showFrame ? (
        <div className="rank-frame-layer">
          <img
            src={frameSrc}
            alt=""
            aria-hidden
            className="relative z-0 h-full w-full object-contain"
            draggable={false}
            onError={() => setFrameFailed(true)}
          />
          <div className="rank-frame-sheen" aria-hidden />
        </div>
      ) : null}
    </div>
  );
}
