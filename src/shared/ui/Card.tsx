import type { ReactNode } from 'react';
import './card.css';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`ui-card ${className}`}>{children}</div>;
}
