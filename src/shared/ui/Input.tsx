import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export function Input({ label, hint, id, className = '', ...rest }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        className={`h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${className}`}
        {...rest}
      />
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
