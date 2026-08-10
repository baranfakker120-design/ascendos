import { useI18n } from '@shared/i18n';
import { LiquidChampagne } from '@shared/ui/LiquidChampagne';
import { AscendLogo } from './NavIcons';

export interface CoachCenterButtonProps {
  burst: boolean;
  burstKey: number;
  active: boolean;
  /** When true, side tabs are visible. Ascend tap collapses them. */
  navigationOpen: boolean;
  onBurst: () => void;
  /** 1st tap while open — collapse nav only (no route change). */
  onCollapseNav: () => void;
  /** 2nd tap while collapsed — open Coach. */
  onOpenCoach: () => void;
}

/**
 * Center Ascend orb — two-step control for bottom nav:
 * open → tap → collapse sides; collapsed → tap → /coach.
 */
export function CoachCenterButton({
  burst,
  burstKey,
  active,
  navigationOpen,
  onBurst,
  onCollapseNav,
  onOpenCoach,
}: CoachCenterButtonProps) {
  const { t } = useI18n();

  const onClick = () => {
    onBurst();
    if (navigationOpen) {
      onCollapseNav();
      return;
    }
    onOpenCoach();
  };

  return (
    <div className="nav-center-slot relative flex justify-center">
      <LiquidChampagne>
        <button
          type="button"
          aria-label={t('nav.coachAria')}
          aria-expanded={navigationOpen}
          onClick={onClick}
          className={[
            'nav-center-btn group relative -mt-7 flex min-h-[44px] min-w-[44px] flex-col items-center justify-end gap-0.5 outline-none',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            active ? 'text-accent-deep' : 'text-muted',
          ].join(' ')}
        >
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
            className={[
              'text-[10px] tracking-[0.14em] transition-[color,font-weight,opacity] duration-200',
              navigationOpen ? 'opacity-100' : 'opacity-0',
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
