import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';
import './input.css';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  /** Optional — omit for search / composer fields. */
  label?: string;
  hint?: string;
  /** Visually hide label but keep it for a11y when provided. */
  hideLabel?: boolean;
}

export function Input({
  label,
  hint,
  hideLabel = false,
  id,
  className = '',
  ...rest
}: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={label ? 'space-y-1.5' : undefined}>
      {label ? (
        <label
          htmlFor={inputId}
          className={
            hideLabel
              ? 'sr-only'
              : 'block text-sm font-medium text-ink'
          }
        >
          {label}
        </label>
      ) : null}
      <input id={inputId} className={`ui-input ${className}`} {...rest} />
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
