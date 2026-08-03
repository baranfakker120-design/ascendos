import './toggle.css';

/** Premium binary control — replaces raw checkboxes. */
export function Toggle({
  checked,
  onChange,
  label,
  className = '',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`ui-toggle ${checked ? 'ui-toggle--on' : ''} ${className}`}
      onClick={() => onChange(!checked)}
    >
      <span className="ui-toggle__thumb" aria-hidden />
    </button>
  );
}
