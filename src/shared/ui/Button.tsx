import {
  useCallback,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import './button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'chip' | 'icon';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Default true — set false for inline / icon / chip actions. */
  fullWidth?: boolean;
}

/** Shared class builder — also used by ButtonLink. */
export function buttonClassName({
  variant = 'primary',
  size = 'md',
  fullWidth = true,
  className = '',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}): string {
  const width =
    fullWidth && size !== 'chip' && size !== 'icon' ? 'ui-btn--block' : 'ui-btn--inline';
  return `ui-btn ui-btn--${variant} ui-btn--${size} ${width} ${className}`.trim();
}

/**
 * Material button — hover lift, press scale, ripple (transform/opacity only).
 * Single button language for the whole app.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = true,
  className = '',
  onPointerDown,
  children,
  type = 'button',
  ...rest
}: Props) {
  const ref = useRef<HTMLButtonElement>(null);

  const spawnRipple = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el || el.disabled) return;
    const rect = el.getBoundingClientRect();
    const sizePx = Math.max(rect.width, rect.height) * 1.35;
    const x = e.clientX - rect.left - sizePx / 2;
    const y = e.clientY - rect.top - sizePx / 2;
    const ripple = document.createElement('span');
    ripple.className = 'ui-btn__ripple';
    ripple.style.width = `${sizePx}px`;
    ripple.style.height = `${sizePx}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    el.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  }, []);

  return (
    <button
      ref={ref}
      type={type}
      className={buttonClassName({ variant, size, fullWidth, className })}
      onPointerDown={(e) => {
        spawnRipple(e);
        onPointerDown?.(e);
      }}
      {...rest}
    >
      <span className="ui-btn__label">{children}</span>
    </button>
  );
}

export const BUTTON_MOTION_STYLE: CSSProperties = {
  willChange: 'transform, box-shadow, opacity',
};
