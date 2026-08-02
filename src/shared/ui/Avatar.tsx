import type { CSSProperties, ImgHTMLAttributes } from 'react';

export type AvatarSize = 'sm' | 'md' | 'lg';

const SIZE_PX: Record<AvatarSize, number> = {
  sm: 40,
  md: 64,
  lg: 96,
};

function textClassForPx(px: number): string {
  if (px <= 40) return 'text-sm';
  if (px <= 64) return 'text-lg';
  return 'text-2xl';
}

export interface AvatarProps {
  /** Öffentliche oder Storage-URL; ohne Bild → Initialen. */
  src?: string | null;
  /** Anzeigename für alt und Initialen. */
  name: string;
  size?: AvatarSize;
  /** Überschreibt size in CSS-Pixeln (z. B. Rahmenöffnung). */
  pixelSize?: number;
  className?: string;
  style?: CSSProperties;
  /** Zusätzliche img-Attribute (ohne src/alt/className). */
  imgProps?: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'className'>;
}

/** Initialen aus Vor- und Nachname bzw. erstes Zeichen. */
export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

/**
 * Profilbild oder Initialen-Ersatz.
 * Keine Animation. Größe über Prop — wiederverwendbar in Listen und Profil.
 */
export function Avatar({
  src,
  name,
  size = 'md',
  pixelSize,
  className = '',
  style,
  imgProps,
}: AvatarProps) {
  const px = pixelSize ?? SIZE_PX[size];
  const initials = avatarInitials(name);
  const hasImage = !!src;

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg font-semibold text-ink ${textClassForPx(px)} ${className}`}
      style={{ width: px, height: px, ...style }}
      aria-hidden={hasImage ? undefined : true}
    >
      {hasImage ? (
        <img
          src={src}
          alt={name}
          width={px}
          height={px}
          className="h-full w-full object-cover"
          {...imgProps}
        />
      ) : (
        <span className="select-none">{initials}</span>
      )}
    </div>
  );
}
