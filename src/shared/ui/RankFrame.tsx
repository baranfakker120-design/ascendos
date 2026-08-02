import { useState } from 'react';
import { Avatar } from './Avatar';
import {
  FRAME_DISPLAY_PX,
  getFrameGeometry,
  openingLayout,
  resolveFrameSrc,
  type FrameDisplaySize,
} from '@shared/lib/frameAssets';

export interface RankFrameProps {
  /** ranks.frame_asset / cosmetic key, z. B. "frame-01". null = nur Placeholder-Ring. */
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
 * Phase B: keine ausgelieferten Rahmen-Assets. Existiert die WebP nicht
 * (oder der Schlüssel ist unbekannt), bleibt ein ruhiger Champagner-Ring —
 * business-first Placeholder, keine Fantasy-Optik.
 *
 * Keine Animation.
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

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: box, height: box }}
    >
      {/* Placeholder-Ring — immer unter dem optionalen Rahmen-Asset. */}
      <div className="absolute inset-0 rounded-full border-2 border-accent/50" aria-hidden />

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
        <img
          src={frameSrc}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[2] h-full w-full object-contain"
          onError={() => setFrameFailed(true)}
        />
      ) : null}
    </div>
  );
}
