import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';
import './input.css';

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
      <input id={inputId} className={`ui-input ${className}`} {...rest} />
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
