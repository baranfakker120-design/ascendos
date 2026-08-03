import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { useI18n } from '@shared/i18n';

interface Props {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

/**
 * Drag-and-drop plus Dateiauswahl.
 *
 * Das versteckte <input> ist kein Beiwerk: Auf iOS und Android gibt es
 * kein Drag-and-drop. Der Klickpfad ist dort der einzige Weg, und AscendOS
 * ist primär eine Handy-App.
 */
export function DropZone({ onFiles, disabled = false }: Props) {
  const { t } = useI18n();
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const accept = (list: FileList | null) => {
    if (!list || disabled) return;
    const files = Array.from(list);
    if (files.length > 0) onFiles(files);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    accept(e.dataTransfer.files);
  };

  return (
    <div>
      <div
        onDragOver={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
          disabled
            ? 'cursor-not-allowed border-line bg-bg opacity-60'
            : over
              ? 'border-primary bg-primary/5'
              : 'border-line bg-surface hover:bg-bg'
        }`}
      >
        <span aria-hidden className="text-2xl leading-none">
          📄
        </span>
        <p className="text-sm font-semibold text-ink">{t('knowledge.dropTitle')}</p>
        <p className="text-xs text-muted">{t('knowledge.dropTypes')}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt,.md,.markdown,.csv"
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          accept(e.target.files);
          // Zurücksetzen, damit dieselbe Datei erneut gewählt werden kann.
          e.target.value = '';
        }}
      />
      <p className="mt-2 text-xs text-muted">{t('knowledge.dropPrivacy')}</p>
    </div>
  );
}
