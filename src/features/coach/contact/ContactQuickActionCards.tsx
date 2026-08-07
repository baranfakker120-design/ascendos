import type { ContactCoachSuggestion } from './contactSuggestions';
import './contact-coach.css';

type Chip = { label: string; text: string };

type Props = {
  items: Chip[] | ContactCoachSuggestion[];
  onPick: (prompt: string) => void;
  ariaLabel: string;
};

function promptOf(item: Chip | ContactCoachSuggestion): string {
  return 'prompt' in item && typeof item.prompt === 'string' ? item.prompt : (item as Chip).text;
}

function labelOf(item: Chip | ContactCoachSuggestion): string {
  return item.label;
}

function keyOf(item: Chip | ContactCoachSuggestion, index: number): string {
  return 'id' in item && typeof item.id === 'string' ? item.id : `${item.label}-${index}`;
}

/**
 * Contact-coach quick actions as snap-scrolling cards.
 * ~3 cards visible; fixed width; 2–3 line clamp — no squashed chip pills.
 */
export function ContactQuickActionCards({ items, onPick, ariaLabel }: Props) {
  if (!items.length) return null;

  return (
    <div className="contact-qa" role="list" aria-label={ariaLabel}>
      <div className="contact-qa__track">
        {items.map((item, index) => (
          <button
            key={keyOf(item, index)}
            type="button"
            role="listitem"
            className="contact-qa__card"
            onClick={() => onPick(promptOf(item))}
          >
            <span className="contact-qa__label">{labelOf(item)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
