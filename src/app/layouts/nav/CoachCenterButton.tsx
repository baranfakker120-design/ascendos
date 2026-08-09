import { useEffect, useId, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { LiquidChampagne } from '@shared/ui/LiquidChampagne';
import { AscendLogo } from './NavIcons';

export interface CoachCenterButtonProps {
  burst: boolean;
  burstKey: number;
  onBurst: () => void;
}

/**
 * Center Ascend orb — tap expands sideways to AAA Vite high class (==O==),
 * tap again collapses to the symbol alone (O). WhatsApp-smooth width spring.
 */
export function CoachCenterButton({ burst, burstKey, onBurst }: CoachCenterButtonProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [expanded, setExpanded] = useState(false);
  const labelId = useId();
  const active = pathname === '/coach' || pathname.startsWith('/coach/');

  useEffect(() => {
    if (!active && expanded) setExpanded(false);
  }, [active, expanded]);

  const toggle = () => {
    onBurst();
    setExpanded((open) => !open);
    if (!active) navigate('/coach');
  };

  return (
    <div className="relative flex justify-center">
      <LiquidChampagne>
        <button
          type="button"
          aria-label={t('nav.coachAria')}
          aria-expanded={expanded}
          aria-controls={labelId}
          onClick={toggle}
          className={[
            'nav-center-btn group relative -mt-7 flex min-h-[44px] min-w-[44px] flex-col items-center justify-end gap-0.5 outline-none',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            active ? 'text-accent-deep' : 'text-muted',
          ].join(' ')}
        >
          <span
            className={[
              'nav-ascend-orb',
              expanded ? 'nav-ascend-orb--open' : '',
              active ? 'nav-ascend-orb--active' : '',
            ].join(' ')}
          >
            <span
              id={labelId}
              className="nav-ascend-orb__wing nav-ascend-orb__wing--left"
              aria-hidden={!expanded}
            >
              AAA Vite
            </span>
            <span
              className={[
                'nav-center-disc flex h-[3.6rem] w-[3.6rem] shrink-0 items-center justify-center rounded-full border border-line bg-surface',
                'shadow-[0_8px_28px_rgb(184_147_90/0.22),0_2px_8px_rgb(17_18_20/0.06)]',
                active ? 'nav-center-disc-active' : '',
              ].join(' ')}
            >
              <AscendLogo key={`coach-${burstKey}`} active={active} burst={burst} />
            </span>
            <span
              className="nav-ascend-orb__wing nav-ascend-orb__wing--right"
              aria-hidden={!expanded}
            >
              high class
            </span>
          </span>
          <span
            className={[
              'text-[10px] tracking-[0.14em] transition-[color,font-weight] duration-150',
              active ? 'font-bold text-accent-deep' : 'font-medium text-muted',
            ].join(' ')}
          >
            {t('nav.coach')}
          </span>
        </button>
      </LiquidChampagne>
    </div>
  );
}
