/**
 * Rahmen-Metadaten und Asset-Auflösung (Sprint 4).
 *
 * Öffnungsmaße aus docs/sprint-4-plan.md (vermessen, nicht geschätzt).
 * Bezugsrahmen der Messung: 1024 px Quellenbreite.
 *
 * Dateien unter public/brand/frames/ (Skript: generate-frame-assets.py).
 * Fehlt eine Datei, fällt RankFrame auf den Placeholder-Ring zurück.
 */

export interface FrameGeometry {
  /** Schlüssel wie in ranks.frame_asset / cosmetic_items.asset_path */
  key: string;
  /** Öffnungsbreite in Quellpixeln */
  openingWidth: number;
  /** Öffnungshöhe in Quellpixeln */
  openingHeight: number;
  /** Vertikaler Versatz der Öffnung relativ zur Bildmitte (px, Quelle) */
  verticalOffset: number;
}

/** Bezugsbreite der vermessenen Quellrahmen. */
export const FRAME_SOURCE_SIZE = 1024;

/**
 * Vermessene Öffnungen (Sprint-4-Plan Abschnitt 2.5).
 * frame-01 … frame-10; unbekannte Schlüssel → null (Placeholder).
 */
export const FRAME_GEOMETRY: Readonly<Record<string, FrameGeometry>> = {
  'frame-01': {
    key: 'frame-01',
    openingWidth: 657,
    openingHeight: 646,
    verticalOffset: -34,
  },
  'frame-02': {
    key: 'frame-02',
    openingWidth: 651,
    openingHeight: 638,
    verticalOffset: -39,
  },
  'frame-03': {
    key: 'frame-03',
    openingWidth: 647,
    openingHeight: 629,
    verticalOffset: -44,
  },
  'frame-04': {
    key: 'frame-04',
    openingWidth: 656,
    openingHeight: 619,
    verticalOffset: -46,
  },
  'frame-05': {
    key: 'frame-05',
    openingWidth: 645,
    openingHeight: 523,
    verticalOffset: -16,
  },
  'frame-06': {
    key: 'frame-06',
    openingWidth: 627,
    openingHeight: 471,
    verticalOffset: -8,
  },
  'frame-07': {
    key: 'frame-07',
    openingWidth: 598,
    openingHeight: 461,
    verticalOffset: 6,
  },
  'frame-08': {
    key: 'frame-08',
    openingWidth: 606,
    openingHeight: 499,
    verticalOffset: 20,
  },
  'frame-09': {
    key: 'frame-09',
    openingWidth: 592,
    openingHeight: 445,
    verticalOffset: -10,
  },
  'frame-10': {
    key: 'frame-10',
    openingWidth: 598,
    openingHeight: 439,
    verticalOffset: -14,
  },
};

export type FrameDisplaySize = 'sm' | 'md' | 'lg';

/** Anzeigegröße in CSS-Pixeln (Listen / Profil). */
export const FRAME_DISPLAY_PX: Record<FrameDisplaySize, number> = {
  sm: 96,
  md: 128,
  lg: 160,
};

/** Geometrie zu einem Rahmen-Schlüssel, oder null wenn unbekannt. */
export function getFrameGeometry(frameKey: string | null | undefined): FrameGeometry | null {
  if (!frameKey) return null;
  return FRAME_GEOMETRY[frameKey] ?? null;
}

/**
 * Öffentlicher Asset-Pfad für einen Rahmen.
 * Dateien werden in einer späteren Phase ausgeliefert; Phase B erwartet 404 → Placeholder.
 */
export function resolveFrameSrc(
  frameKey: string | null | undefined,
  size: FrameDisplaySize = 'lg'
): string | null {
  const geometry = getFrameGeometry(frameKey);
  if (!geometry) return null;
  const px = FRAME_DISPLAY_PX[size];
  return `/brand/frames/${geometry.key}-${px}.webp`;
}

/**
 * Relative Position der Öffnung für das Avatar-Fenster (0..1 / Offset-Anteil).
 * Rein geometrisch — keine Business-Regel.
 */
export function openingLayout(geometry: FrameGeometry): {
  widthRatio: number;
  heightRatio: number;
  offsetYRatio: number;
} {
  return {
    widthRatio: geometry.openingWidth / FRAME_SOURCE_SIZE,
    heightRatio: geometry.openingHeight / FRAME_SOURCE_SIZE,
    offsetYRatio: geometry.verticalOffset / FRAME_SOURCE_SIZE,
  };
}
