import { useEffect, useRef, useState } from 'react';
import { triggerNavHaptic } from '@shared/lib/haptics';
import {
  APP_LOCALES,
  localeOption,
  readStoredLocale,
  writeStoredLocale,
  type AppLocale,
} from '@shared/lib/locale';
import { LiquidChampagne } from '@shared/ui/LiquidChampagne';

/**
 * VisionOS-style floating language picker — top-right header.
 * Uses LiquidChampagne; no native <select>.
 */
export function LanguageMenu() {
  const [locale, setLocale] = useState<AppLocale>(() => readStoredLocale());
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = localeOption(locale);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) collapse();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') collapse();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const collapse = () => {
    if (!open || closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 280);
  };

  const toggle = () => {
    triggerNavHaptic(140);
    if (open) collapse();
    else setOpen(true);
  };

  const choose = (code: AppLocale) => {
    triggerNavHaptic(130);
    setLocale(code);
    writeStoredLocale(code);
    collapse();
  };

  return (
    <div ref={rootRef} className="relative z-30">
      <LiquidChampagne>
        <button
          type="button"
          aria-label="Sprache wählen"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={toggle}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface shadow-[0_4px_16px_rgb(17_18_20/0.06)] outline-none transition-transform duration-200 ease-out will-change-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.96]"
        >
          <img src={current.flag} alt="" aria-hidden className="h-7 w-7" draggable={false} />
        </button>
      </LiquidChampagne>

      {open || closing ? (
        <div
          role="menu"
          aria-label="Sprachen"
          className={`lang-menu absolute right-0 top-[calc(100%+0.5rem)] min-w-[11.5rem] rounded-2xl border border-line bg-surface p-1.5 shadow-[0_16px_40px_rgb(17_18_20/0.12)] ${
            closing ? 'lang-menu-out' : 'lang-menu-in'
          }`}
        >
          {APP_LOCALES.map((opt, i) => (
            <button
              key={opt.code}
              type="button"
              role="menuitemradio"
              aria-checked={opt.code === locale}
              onClick={() => choose(opt.code)}
              style={{ animationDelay: `${i * 28}ms` }}
              className={[
                'lang-menu-item flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm outline-none',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                opt.code === locale
                  ? 'bg-bg font-semibold text-accent-deep'
                  : 'font-medium text-ink hover:bg-bg',
              ].join(' ')}
            >
              <img src={opt.flag} alt="" aria-hidden className="h-6 w-6 shrink-0" draggable={false} />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
