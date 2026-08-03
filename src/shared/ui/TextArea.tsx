import type { TextareaHTMLAttributes } from 'react';
import { useId } from 'react';
import './input.css';

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
}

export function TextArea({ label, hint, id, className = '', ...rest }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <textarea id={inputId} className={`ui-input ui-textarea ${className}`} {...rest} />
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
