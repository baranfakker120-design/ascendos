import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const styles: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-ink hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed',
  secondary: 'bg-surface border border-line text-ink hover:bg-bg disabled:opacity-50',
  ghost: 'text-muted hover:text-ink',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'primary', className = '', ...rest }: Props) {
  return (
    <button
      className={`h-12 w-full rounded-xl px-4 text-base font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}
