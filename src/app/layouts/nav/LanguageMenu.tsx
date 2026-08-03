import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@shared/i18n';
import { triggerNavHaptic } from '@shared/lib/haptics';
import { APP_LOCALES, localeOption, type AppLocale } from '@shared/lib/locale';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { LiquidChampagne } from '@shared/ui/LiquidChampagne';

/**
 * VisionOS-style floating language picker — top-right header.
 * Instant locale switch via LocaleProvider (no reload / remount).
 */
export function LanguageMenu() {
  const { locale, setLocale, t } = useI18n();
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
    collapse();
  };

  return (
    <div ref={rootRef} className="relative z-30">
      <LiquidChampagne>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          fullWidth={false}
          aria-label={t('locale.choose')}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={toggle}
          className="!shadow-[0_4px_16px_rgb(17_18_20/0.06)]"
        >
          <img src={current.flag} alt="" aria-hidden className="h-7 w-7" draggable={false} />
        </Button>
      </LiquidChampagne>

      {open || closing ? (
        <div
          className={`lang-menu absolute right-0 top-[calc(100%+0.5rem)] min-w-[11.5rem] ${
            closing ? 'lang-menu-out' : 'lang-menu-in'
          }`}
        >
          <Card padding="sm" className="!p-1.5 shadow-[0_16px_40px_rgb(17_18_20/0.12)]">
            <div role="menu" aria-label={t('locale.menu')}>
              {APP_LOCALES.map((opt, i) => (
                <Button
                  key={opt.code}
                  type="button"
                  role="menuitemradio"
                  aria-checked={opt.code === locale}
                  variant={opt.code === locale ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => choose(opt.code)}
                  style={{ animationDelay: `${i * 28}ms` }}
                  className="lang-menu-item !justify-start"
                >
                  <img
                    src={opt.flag}
                    alt=""
                    aria-hidden
                    className="h-6 w-6 shrink-0"
                    draggable={false}
                  />
                  <span>{t(opt.labelKey)}</span>
                </Button>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
