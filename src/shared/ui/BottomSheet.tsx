import { useEffect, useId, useRef } from 'react';
import { useI18n } from '@shared/i18n';
import './bottom-sheet.css';

interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  const { t } = useI18n();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="bottom-sheet" role="presentation">
      <button
        type="button"
        className="bottom-sheet__scrim"
        aria-label={t('common.close')}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="bottom-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="bottom-sheet__handle" aria-hidden />
        <div className="bottom-sheet__header">
          <h2 id={titleId} className="bottom-sheet__title">
            {title}
          </h2>
          <button type="button" className="bottom-sheet__close" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
        <div className="bottom-sheet__body">{children}</div>
      </div>
    </div>
  );
}
