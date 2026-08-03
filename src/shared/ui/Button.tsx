import {
  useCallback,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import './button.css';

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/**
 * Material button — hover lift, press scale, ripple (transform/opacity only).
 */
export function Button({
  variant = 'primary',
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
    const size = Math.max(rect.width, rect.height) * 1.35;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const ripple = document.createElement('span');
    ripple.className = 'ui-btn__ripple';
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    el.appendChild(ripple);
    ripple.addEventListener(
      'animationend',
      () => {
        ripple.remove();
      },
      { once: true }
    );
  }, []);

  return (
    <button
      ref={ref}
      type={type}
      className={`ui-btn ui-btn--${variant} ${className}`}
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

/** Exported for tests — ripple uses transform/opacity only. */
export const BUTTON_MOTION_STYLE: CSSProperties = {
  willChange: 'transform, box-shadow, opacity',
};
