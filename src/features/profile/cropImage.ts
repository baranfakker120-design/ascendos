/** Parameter für den interaktiven Kreiszuschnitt (Viewport-Koordinaten). */
export interface CircleCropTransform {
  /** Bildbreite in CSS-Pixeln im Crop-Viewport (nach object-fit contain Basis). */
  baseWidth: number;
  baseHeight: number;
  /** Zusätzlicher Zoom ≥ 1. */
  scale: number;
  /** Verschiebung des Bildzentrums relativ zum Kreiszentrum (px). */
  offsetX: number;
  offsetY: number;
  /** Durchmesser des Zuschnittkreises im Viewport (px). */
  circleDiameter: number;
}

/**
 * Exportiert den kreisförmigen Ausschnitt als quadratisches WebP
 * (Bounding-Box des Kreises, Inhalt = gewählter Ausschnitt).
 */
export async function cropCircleWebp(
  source: Blob,
  transform: CircleCropTransform,
  outputSize: number
): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const { baseWidth, baseHeight, scale, offsetX, offsetY, circleDiameter } = transform;

  const drawnW = baseWidth * scale;
  const drawnH = baseHeight * scale;
  // Bildmitte im Viewport = Kreismitte + offset
  const imgLeft = circleDiameter / 2 + offsetX - drawnW / 2;
  const imgTop = circleDiameter / 2 + offsetY - drawnH / 2;

  // Kreis (0,0)–(D,D) im Viewport → Quelle
  const sx = ((0 - imgLeft) / drawnW) * bitmap.width;
  const sy = ((0 - imgTop) / drawnH) * bitmap.height;
  const sw = (circleDiameter / drawnW) * bitmap.width;
  const sh = (circleDiameter / drawnH) * bitmap.height;

  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Canvas nicht verfügbar.');
  }

  ctx.beginPath();
  ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, outputSize, outputSize);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/webp', 0.92)
  );
  if (!blob) throw new Error('WebP-Export fehlgeschlagen.');
  return blob;
}

/** @deprecated — nur noch Tests/Fallback; Prefer cropCircleWebp. */
export async function cropCenterSquareWebp(file: Blob, size: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = Math.floor((bitmap.width - side) / 2);
  const sy = Math.floor((bitmap.height - side) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Canvas nicht verfügbar.');
  }
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/webp', 0.9)
  );
  if (!blob) throw new Error('WebP-Export fehlgeschlagen.');
  return blob;
}
