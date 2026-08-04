/**
 * AP-Badge: lebende Zahl über optionalem Sticker / goldener Chip-Fallback.
 * Nur Präsentation — keine Features, kein Supabase.
 */
import { useOptionalI18n } from '@shared/i18n';
import type { AppLocale } from '@shared/lib/locale';
import './ap-badge.css';

export type ApBadgeSize = 'sm' | 'md' | 'lg';

/** Feste Außenmaße (Design Freeze Sprint 4.1) — kein Layout-Shift. */
export const AP_BADGE_SIZE_PX: Record<ApBadgeSize, number> = {
  sm: 40,
  md: 56,
  lg: 72,
};

const NUMBER_LOCALES: Record<AppLocale, string> = {
  de: 'de-DE',
  tr: 'tr-TR',
  fr: 'fr-FR',
  en: 'en-GB',
  it: 'it-IT',
};

function valueClass(size: ApBadgeSize): string {
  if (size === 'sm') return 'text-xs';
  if (size === 'md') return 'text-sm';
  return 'text-lg';
}

/** Anzeigezahl — locale-aware thousands separators. */
export function formatApBadgeValue(value: number, locale: AppLocale = 'de'): string {
  return Math.trunc(value).toLocaleString(NUMBER_LOCALES[locale] ?? 'de-DE');
}

/** Accessible Name — Zahl trägt die Bedeutung, nicht der Sticker. */
export function apBadgeAriaLabel(value: number, locale: AppLocale = 'de', unit = 'AP'): string {
  return `${formatApBadgeValue(value, locale)} ${unit}`;
}

export interface ApBadgeProps {
  value: number;
  size?: ApBadgeSize;
  stickerSrc?: string | null;
  className?: string;
}

export function ApBadge({ value, size = 'md', stickerSrc = null, className = '' }: ApBadgeProps) {
  const i18n = useOptionalI18n();
  const locale = i18n?.locale ?? 'de';
  const unit = i18n?.t('common.ap') ?? 'AP';
  const px = AP_BADGE_SIZE_PX[size];
  const hasSticker = !!stickerSrc;
  const display = formatApBadgeValue(value, locale);
  const label = apBadgeAriaLabel(value, locale, unit);

  return (
    <div
      className={`ap-badge relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: px, height: px }}
      role="img"
      aria-label={label}
    >
      {hasSticker ? (
        <img
          src={stickerSrc}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />
      ) : (
        <div className="ap-badge__plate" aria-hidden>
          <span className="ap-badge__sheen" />
        </div>
      )}

      <div className="relative z-[1] flex flex-col items-center justify-center leading-none">
        <span className={`ap-badge__value font-bold tabular-nums ${valueClass(size)}`} aria-hidden>
          {display}
        </span>
        <span
          className="ap-badge__unit mt-0.5 text-[10px] font-semibold uppercase tracking-wider"
          aria-hidden
        >
          {unit}
        </span>
      </div>
    </div>
  );
}
