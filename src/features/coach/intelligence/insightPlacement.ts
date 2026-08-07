export type InsightPlacement = 'right' | 'left' | 'above';

const CARD_W = 272;
const CARD_H = 300;
const GAP = 16;

/**
 * Pick a side for the insight popover so it stays inside the tree stage when possible.
 * Prefers right → left → above.
 */
export function computeInsightPlacement(
  nodeRect: DOMRectReadOnly,
  hostRect: DOMRectReadOnly,
  cardW = CARD_W,
  cardH = CARD_H,
  gap = GAP
): InsightPlacement {
  const spaceRight = hostRect.right - nodeRect.right;
  const spaceLeft = nodeRect.left - hostRect.left;
  const spaceAbove = nodeRect.top - hostRect.top;

  if (spaceRight >= cardW + gap) return 'right';
  if (spaceLeft >= cardW + gap) return 'left';
  if (spaceAbove >= Math.min(cardH, 180) + gap) return 'above';

  // Fall back to the side with more horizontal room.
  return spaceRight >= spaceLeft ? 'right' : 'left';
}
