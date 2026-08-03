import type { ReactNode } from 'react';
import { useOptionalI18n, type MessageKey } from '@shared/i18n';
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

const ROLE_KEYS: Record<string, MessageKey> = {
  super_admin: 'roles.super_admin',
  admin: 'roles.admin',
  leader: 'roles.leader',
  berater: 'roles.berater',
  developer: 'roles.developer',
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
  const i18n = useOptionalI18n();
  const tone = toneFor(role);
  const roleKey = role ? ROLE_KEYS[role] : undefined;
  const text =
    label ??
    (roleKey && i18n ? i18n.t(roleKey) : undefined) ??
    LABELS[role ?? ''] ??
    role ??
    '—';

  return (
    <span className={`role-badge role-badge--${tone} ${className}`}>
      {tone === 'super_admin' ? <span className="role-badge__sheen" aria-hidden /> : null}
      <span className="role-badge__label">{text}</span>
    </span>
  );
}
