import { useRef, useState, type ChangeEvent } from 'react';
import { Button } from '@shared/ui/Button';
import { uploadAvatarImage } from './profileApi';

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const OUTPUT_SIZE = 512;

export interface AvatarUploadProps {
  userId: string;
  onUploaded: (avatarUrl: string) => void;
}

/**
 * Datei wählen → zentriert auf Quadrat zuschneiden → WebP → Storage.
 * Kein Cropper-UI, keine Animation. Business-first.
 */
export function AvatarUpload({ userId, onUploaded }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Bitte eine Bilddatei wählen (JPEG, PNG oder WebP).');
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError('Das Bild ist zu groß (max. 8 MB vor dem Zuschneiden).');
      return;
    }

    setBusy(true);
    try {
      const blob = await cropCenterSquareWebp(file, OUTPUT_SIZE);
      const url = await uploadAvatarImage(userId, blob);
      onUploaded(url);
    } catch {
      setError('Upload fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={onPick}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Bild wird verarbeitet …' : 'Profilbild wählen'}
      </Button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <p className="text-xs text-muted">
        Quadratischer Zuschnitt in der Mitte. Wird als WebP gespeichert (max. 2 MB im Speicher).
      </p>
    </div>
  );
}

/** Zentrierter Quadratzuschnitt und Skalierung — reine Bildaufbereitung. */
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
