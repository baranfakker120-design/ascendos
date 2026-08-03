import type { ReactNode } from 'react';
import './card.css';

export type CardPadding = 'md' | 'sm' | 'none';

export function Card({
  children,
  className = '',
  padding = 'md',
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  padding?: CardPadding;
  /** Soft press/hover for clickable surfaces. */
  interactive?: boolean;
}) {
  return (
    <div
      className={`ui-card ui-card--pad-${padding} ${interactive ? 'ui-card--interactive' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
