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
 *
 * AP-Ränge: 01–07. Sonderrahmen (kein AP): 08 Developer, 09 Super Admin,
 * 10 Berater des Monats — siehe resolveDisplayFrameKey().
 */
export const FRAME_GEOMETRY: Readonly<Record<string, FrameGeometry>> = {
  'frame-01': {
    key: 'frame-01',
    openingWidth: 656,
    openingHeight: 578,
    verticalOffset: -34,
  },
  'frame-02': {
    key: 'frame-02',
    openingWidth: 650,
    openingHeight: 560,
    verticalOffset: -39,
  },
  'frame-03': {
    key: 'frame-03',
    openingWidth: 648,
    openingHeight: 534,
    verticalOffset: -44,
  },
  'frame-04': {
    key: 'frame-04',
    openingWidth: 656,
    openingHeight: 526,
    verticalOffset: -46,
  },
  'frame-05': {
    key: 'frame-05',
    openingWidth: 644,
    openingHeight: 488,
    verticalOffset: -16,
  },
  'frame-06': {
    key: 'frame-06',
    openingWidth: 624,
    openingHeight: 456,
    verticalOffset: -8,
  },
  'frame-07': {
    key: 'frame-07',
    openingWidth: 596,
    openingHeight: 472,
    verticalOffset: 6,
  },
  /** Sonderrahmen Developer (Rolle developer) — kein AP-Rang. */
  'frame-08': {
    key: 'frame-08',
    openingWidth: 604,
    openingHeight: 536,
    verticalOffset: 20,
  },
  /** Sonderrahmen Super Admin (Rolle super_admin) — kein AP-Rang. */
  'frame-09': {
    key: 'frame-09',
    openingWidth: 590,
    openingHeight: 424,
    verticalOffset: -10,
  },
  /** Sonderrahmen Berater des Monats — kein AP-Rang. */
  'frame-10': {
    key: 'frame-10',
    openingWidth: 596,
    openingHeight: 428,
    verticalOffset: -14,
  },
};

/** Feste Sonderrahmen-Schlüssel (keine ranks.frame_asset-Einträge). */
export const SPECIAL_FRAME = {
  developer: 'frame-08',
  super_admin: 'frame-09',
  berater_des_monats: 'frame-10',
} as const;

export interface DisplayFrameInput {
  /** memberships.role der aktiven Mitgliedschaft */
  role?: string | null;
  /** ranks.frame_asset aus rank_for_ap — unverändert die AP-Wahrheit */
  rankFrameKey?: string | null;
  /** true = aktueller monatlicher Award (Berater des Monats) */
  isBeraterDesMonats?: boolean;
}

/**
 * Welcher Rahmen angezeigt wird.
 * Priorität: super_admin → developer → Berater des Monats → AP-Rang.
 * Ändert keine Gamification / rank_for_ap-Daten.
 */
export function resolveDisplayFrameKey(input: DisplayFrameInput): string | null {
  if (input.role === 'super_admin') return SPECIAL_FRAME.super_admin;
  if (input.role === 'developer') return SPECIAL_FRAME.developer;
  if (input.isBeraterDesMonats) return SPECIAL_FRAME.berater_des_monats;
  return input.rankFrameKey ?? null;
}

export type FrameDisplaySize = 'sm' | 'md' | 'lg';

/**
 * Anzeigegröße des Gesamtrahmens in CSS-Pixeln.
 * Spezialrahmen (08–10) und AP-Rahmen nutzen dieselben Größen.
 */
export const FRAME_DISPLAY_PX: Record<FrameDisplaySize, number> = {
  sm: 112,
  md: 168,
  lg: 268,
};

/** Verfügbare Asset-Kantenlängen (generate-frame-assets.py). */
export const FRAME_ASSET_PX = [96, 128, 160, 320, 480] as const;
export type FrameAssetPx = (typeof FRAME_ASSET_PX)[number];

/**
 * Avatar-Durchmesser relativ zur echten PNG-Alpha-Öffnung.
 * 1 = Loch vollständig füllen — kein transparenter/schwarzer Spaltring.
 */
export const AVATAR_FILL_RATIO = 1;

/**
 * Avatar leicht unter den Metallrand schieben (AA / weicher Übergang).
 * 1.10 ≈ 10 % größer als die gemessene Öffnung — Spalt verschwindet.
 */
export const HOLE_DISPLAY_SCALE = 1.1;

/** Geometrie zu einem Rahmen-Schlüssel, oder null wenn unbekannt. */
export function getFrameGeometry(frameKey: string | null | undefined): FrameGeometry | null {
  if (!frameKey) return null;
  return FRAME_GEOMETRY[frameKey] ?? null;
}

/**
 * Relative Position der Öffnung.
 * holeRatio = horizontale Alpha-Öffnung (pixelvermessen am PNG).
 * openingHeight = vertikale Alpha-Öffnung (Crests können enger sein).
 */
export function openingLayout(geometry: FrameGeometry): {
  widthRatio: number;
  heightRatio: number;
  holeRatio: number;
  offsetYRatio: number;
} {
  const widthRatio = geometry.openingWidth / FRAME_SOURCE_SIZE;
  const heightRatio = geometry.openingHeight / FRAME_SOURCE_SIZE;
  return {
    widthRatio,
    heightRatio,
    // Kreisförmiger Avatar muss die horizontale Öffnung füllen;
    // oben/unten decken Crests den Avatar ab — kein Sichtspalt.
    holeRatio: widthRatio,
    offsetYRatio: geometry.verticalOffset / FRAME_SOURCE_SIZE,
  };
}

/** Nächstgrößeres verfügbares Asset ≥ benötigter Pixelkante. */
export function pickFrameAssetPx(displayCssPx: number, devicePixelRatio = 1): FrameAssetPx {
  const need = Math.ceil(displayCssPx * Math.max(1, devicePixelRatio));
  for (const px of FRAME_ASSET_PX) {
    if (px >= need) return px;
  }
  return FRAME_ASSET_PX[FRAME_ASSET_PX.length - 1];
}

/** Öffentlicher Asset-Pfad für einen Rahmen-Schlüssel. */
export function resolveFrameSrc(
  frameKey: string | null | undefined,
  size: FrameDisplaySize = 'lg',
  devicePixelRatio = 1
): string | null {
  const geometry = getFrameGeometry(frameKey);
  if (!geometry) return null;
  const display = FRAME_DISPLAY_PX[size];
  const px = pickFrameAssetPx(display, devicePixelRatio);
  return `/brand/frames/${geometry.key}-${px}.webp`;
}

/** srcSet für gestochen scharfe Retina-Darstellung ohne CSS-Upscale. */
export function resolveFrameSrcSet(frameKey: string | null | undefined): string | null {
  const geometry = getFrameGeometry(frameKey);
  if (!geometry) return null;
  return FRAME_ASSET_PX.map((px) => `/brand/frames/${geometry.key}-${px}.webp ${px}w`).join(', ');
}

/**
 * Avatar- und Öffnungsmaße.
 *
 * Ursache des schwarzen Rings: Avatar < Alpha-Loch → Hintergrund scheint durch.
 * Deshalb: Avatar = Loch × HOLE_DISPLAY_SCALE (vollständig füllen, leicht unters Metall).
 */
export function frameAvatarLayout(
  frameKey: string | null | undefined,
  size: FrameDisplaySize = 'lg'
): {
  box: number;
  holePx: number;
  avatarPx: number;
  offsetY: number;
} {
  const box = FRAME_DISPLAY_PX[size];
  const geometry = getFrameGeometry(frameKey);
  if (!geometry) {
    const holePx = box * 0.72;
    const avatarPx = Math.round(holePx * HOLE_DISPLAY_SCALE * AVATAR_FILL_RATIO);
    return { box, holePx, avatarPx, offsetY: 0 };
  }
  const layout = openingLayout(geometry);
  // holeRatio = horizontale Alpha-Öffnung (pixelvermessen); Crests oben/unten
  // überdecken den kreisförmigen Avatar — gewollt, kein Spalt links/rechts.
  const holePx = box * layout.holeRatio;
  const avatarPx = Math.round(holePx * HOLE_DISPLAY_SCALE * AVATAR_FILL_RATIO);
  const offsetY = Math.round(box * layout.offsetYRatio);
  return { box, holePx, avatarPx, offsetY };
}
