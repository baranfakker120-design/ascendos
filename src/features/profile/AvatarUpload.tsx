import { useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@shared/ui/Button';
import { AvatarCropModal } from './AvatarCropModal';
import { uploadAvatarImage } from './profileApi';

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

export interface AvatarUploadProps {
  userId: string;
  /** Aktiver Anzeige-Rahmen für die Live-Vorschau im Cropper. */
  frameKey?: string | null;
  name: string;
  onUploaded: (avatarUrl: string) => void;
}

/**
 * Datei wählen → Kreiszuschnitt (Pinch/Pan, Rahmen-Vorschau) → erst dann Upload.
 */
export function AvatarUpload({ userId, frameKey = null, name, onUploaded }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
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
    setPicked(file);
  };

  const onConfirm = async (blob: Blob) => {
    setBusy(true);
    setError(null);
    try {
      const url = await uploadAvatarImage(userId, blob);
      setPicked(null);
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
        {busy ? 'Bild wird gespeichert …' : 'Profilbild wählen'}
      </Button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <p className="text-xs text-muted">
        Kreisförmiger Zuschnitt mit Zoom — Speichern erst nach Bestätigung.
      </p>

      {picked
        ? createPortal(
            <AvatarCropModal
              file={picked}
              frameKey={frameKey}
              name={name}
              onCancel={() => setPicked(null)}
              onConfirm={onConfirm}
            />,
            document.body
          )
        : null}
    </div>
  );
}
