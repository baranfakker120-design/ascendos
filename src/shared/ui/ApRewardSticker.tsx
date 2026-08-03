import { formatApBadgeValue } from './ApBadge';
import { rewardMarkGlyph } from '@shared/lib/apScoring';
import './ap-reward-sticker.css';

export type ApRewardStickerSize = 'sm' | 'md' | 'lg';

export interface ApRewardStickerProps {
  /** AP-Belohnung (positiv). */
  ap: number;
  size?: ApRewardStickerSize;
  /** Optionaler Mark-Override (sonst aus Tier). */
  mark?: string;
  /** Erscheinen mit Spring. */
  animate?: boolean;
  className?: string;
}

/**
 * Goldener Reward-Chip — AAA Game UI (keine Plain-Labels).
 */
export function ApRewardSticker({
  ap,
  size = 'md',
  mark,
  animate = true,
  className = '',
}: ApRewardStickerProps) {
  const value = Math.max(0, Math.trunc(ap));
  const glyph = mark ?? rewardMarkGlyph(value);
  const label = `+${formatApBadgeValue(value)} AP`;

  return (
    <span
      className={`ap-reward-sticker ap-reward-sticker--${size} ${animate ? 'ap-reward-sticker--in' : ''} ${className}`}
      role="img"
      aria-label={label}
    >
      <span className="ap-reward-sticker__glow" aria-hidden />
      <span className="ap-reward-sticker__sheen" aria-hidden />
      <span className="ap-reward-sticker__mark" aria-hidden>
        {glyph}
      </span>
      <span className="ap-reward-sticker__value" aria-hidden>
        +{formatApBadgeValue(value)}
      </span>
      <span className="ap-reward-sticker__unit" aria-hidden>
        AP
      </span>
    </span>
  );
}
