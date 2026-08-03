import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { triggerNavHaptic } from '@shared/lib/haptics';
import { Button } from '@shared/ui/Button';
import { LiquidChampagne } from '@shared/ui/LiquidChampagne';
import { MoreIcon, ProfileIcon, SettingsIcon } from './NavIcons';

type StackId = 'profil' | 'settings' | 'more';

const STACK_ROUTES: Record<StackId, string> = {
  profil: '/profil',
  settings: '/settings',
  more: '/more',
};

function pathInStack(pathname: string): boolean {
  return (
    pathname === '/profil' ||
    pathname.startsWith('/profil/') ||
    pathname === '/settings' ||
    pathname.startsWith('/settings/') ||
    pathname === '/more' ||
    pathname.startsWith('/more/') ||
    pathname === '/mehr' ||
    pathname.startsWith('/mehr/')
  );
}

export interface ProfileStackProps {
  burst: boolean;
  burstKey: number;
  onBurst: () => void;
}

/**
 * Floating expandable Profile stack: Mehr → Einstellungen → Profil.
 * GPU-only motion (transform / opacity / filter).
 */
export function ProfileStack({ burst, burstKey, onBurst }: ProfileStackProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const active = pathInStack(pathname);
  const open = expanded || closing;

  useEffect(() => {
    if (!expanded) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) collapse();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') collapse();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  const collapse = () => {
    if (!expanded || closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setExpanded(false);
      setClosing(false);
    }, 320);
  };

  const go = (id: StackId) => {
    triggerNavHaptic(150);
    onBurst();
    navigate(STACK_ROUTES[id]);
    if (expanded) collapse();
  };

  const onProfileTap = () => {
    // From any other tab: go straight to Profil (one tap). Expand stack only
    // when already inside the profile area for Mehr / Einstellungen.
    if (!pathInStack(pathname)) {
      go('profil');
      return;
    }
    if (expanded) {
      go('profil');
      return;
    }
    onBurst();
    triggerNavHaptic(150);
    setClosing(false);
    setExpanded(true);
  };

  return (
    <div ref={rootRef} className="relative flex w-full flex-col items-center">
      {open ? (
        <div
          className={`profile-stack absolute bottom-[calc(100%+0.35rem)] right-0 flex flex-col items-end gap-2 ${
            closing ? 'profile-stack-out' : 'profile-stack-in'
          }`}
          role="menu"
          aria-labelledby={labelId}
        >
          <StackOrb
            className="stack-orb-more"
            label="Mehr"
            active={pathname.startsWith('/more') || pathname.startsWith('/mehr')}
            onClick={() => go('more')}
            icon={<MoreIcon active />}
          />
          <StackOrb
            className="stack-orb-settings"
            label="Einstellungen"
            active={pathname.startsWith('/settings')}
            onClick={() => go('settings')}
            icon={<SettingsIcon active />}
          />
        </div>
      ) : null}

      <LiquidChampagne className="w-full justify-center">
        <Button
          type="button"
          id={labelId}
          variant="ghost"
          fullWidth
          aria-label="Profil"
          aria-expanded={expanded}
          aria-haspopup="menu"
          onClick={onProfileTap}
          className={[
            '!h-auto !flex-col !items-center !justify-end !gap-1 !rounded-xl !px-1 !py-1 !shadow-none',
            active || expanded ? '!text-accent-deep' : '!text-muted',
          ].join(' ')}
        >
          <span
            className={[
              'nav-icon-active-glow will-change-transform',
              expanded || closing ? 'profile-stack-anchor' : '',
            ].join(' ')}
          >
            <ProfileIcon
              key={`profil-${burstKey}`}
              active={active || expanded}
              burst={burst}
            />
          </span>
          <span
            className={[
              'text-[10px] tracking-[0.14em] transition-[color,font-weight] duration-150',
              active || expanded ? 'font-bold text-accent-deep' : 'font-medium text-muted',
            ].join(' ')}
          >
            Profil
          </span>
        </Button>
      </LiquidChampagne>
    </div>
  );
}

function StackOrb({
  label,
  icon,
  active,
  onClick,
  className = '',
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <LiquidChampagne>
      <Button
        type="button"
        role="menuitem"
        variant="secondary"
        size="icon"
        fullWidth={false}
        aria-label={label}
        onClick={onClick}
        className={[
          'stack-orb group !h-auto !w-auto !flex-row-reverse !items-center !gap-2 !rounded-none !border-0 !bg-transparent !p-0 !shadow-none',
          className,
        ].join(' ')}
      >
        <span
          className={[
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface',
            'shadow-[0_8px_24px_rgb(17_18_20/0.1)]',
            active ? 'text-accent-deep' : 'text-ink',
          ].join(' ')}
        >
          {icon}
        </span>
        <span
          className={[
            'whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-1 text-[10px] tracking-[0.14em]',
            'shadow-[0_6px_18px_rgb(17_18_20/0.08)]',
            active ? 'font-bold text-accent-deep' : 'font-semibold text-ink',
          ].join(' ')}
        >
          {label}
        </span>
      </Button>
    </LiquidChampagne>
  );
}
