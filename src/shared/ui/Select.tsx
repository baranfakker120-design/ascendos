import type { SelectHTMLAttributes } from 'react';
import { useId } from 'react';
import './input.css';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
}

/** Shared select — same chrome as Input. */
export function Select({ label, hint, id, className = '', children, ...rest }: Props) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className="space-y-1.5">
      <label htmlFor={selectId} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <select id={selectId} className={`ui-input ui-select ${className}`} {...rest}>
        {children}
      </select>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
