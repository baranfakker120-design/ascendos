import type { SmartWarning } from '../types';
import './leader-surface.css';

interface SmartWarningsListProps {
  items: SmartWarning[];
  onSelect?: (membershipId: string) => void;
}

export function SmartWarningsList({ items, onSelect }: SmartWarningsListProps) {
  if (!items.length) return null;
  const top = items.slice(0, 6);
  return (
    <section className="leader-warn leader-glass" aria-label="Smart Warnings">
      <header>
        <h2>Heute handeln</h2>
        <p>Automatische Signale mit klarer Empfehlung.</p>
      </header>
      <ul className="leader-warn__list">
        {top.map((w) => (
          <li key={`${w.kind}-${w.membershipId}`}>
            <button type="button" onClick={() => onSelect?.(w.membershipId)}>
              <span className="leader-warn__title">
                {w.name} · {w.title}
              </span>
              <span className="leader-warn__action">{w.action}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
