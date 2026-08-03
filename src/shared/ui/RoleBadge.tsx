import type { ReactNode } from 'react';
import './role-badge.css';

export type RoleBadgeTone =
  'default' | 'super_admin' | 'developer' | 'admin' | 'leader' | 'berater';

export interface RoleBadgeProps {
  role: string | null | undefined;
  label?: ReactNode;
  className?: string;
}

const LABELS: Record<string, string> = {
  super_admin: 'Super-Admin',
  admin: 'Admin',
  leader: 'Leader',
  berater: 'Berater',
  developer: 'Developer',
};

function toneFor(role: string | null | undefined): RoleBadgeTone {
  if (role === 'super_admin') return 'super_admin';
  if (role === 'developer') return 'developer';
  if (role === 'admin') return 'admin';
  if (role === 'leader') return 'leader';
  if (role === 'berater') return 'berater';
  return 'default';
}

/**
 * Rollen-Identität. Super Admin = Premium Violet (metallic + glow + sheen).
 */
export function RoleBadge({ role, label, className = '' }: RoleBadgeProps) {
  const tone = toneFor(role);
  const text = label ?? LABELS[role ?? ''] ?? role ?? '—';

  return (
    <span className={`role-badge role-badge--${tone} ${className}`}>
      {tone === 'super_admin' ? <span className="role-badge__sheen" aria-hidden /> : null}
      <span className="role-badge__label">{text}</span>
    </span>
  );
}
