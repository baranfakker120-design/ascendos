import './toggle.css';

/** Premium binary control — replaces raw checkboxes. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  className = '',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`ui-toggle ${checked ? 'ui-toggle--on' : ''} ${disabled ? 'ui-toggle--disabled' : ''} ${className}`}
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
    >
      <span className="ui-toggle__thumb" aria-hidden />
    </button>
  );
}
