import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isTeamSeydaRadarOrg } from '@features/team-seyda-radar';
import { useAuth } from '@shared/auth/AuthProvider';
import { useI18n, type MessageKey } from '@shared/i18n';
import { triggerNavHaptic } from '@shared/lib/haptics';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { LiquidChampagne } from '@shared/ui/LiquidChampagne';
import { TodayIcon } from './NavIcons';

export interface TodayHubMenuProps {
  burst: boolean;
  burstKey: number;
  onBurst: () => void;
}

type HubItemId = 'plan' | 'priorities' | 'content' | 'radar' | 'tasks' | 'stats';

type HubItem = {
  id: HubItemId;
  titleKey: MessageKey;
  subKey: MessageKey;
  icon: ReactNode;
  featured?: boolean;
};

function pathInTodayHub(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/heute/');
}

function InstagramMark({ className = '' }: { className?: string }) {
  const gid = useId().replace(/:/g, '');
  return (
    <svg className={className} viewBox="0 0 24 24" width="28" height="28" aria-hidden>
      <defs>
        <radialGradient id={`ig-${gid}`} cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#fdf497" />
          <stop offset="5%" stopColor="#fdf497" />
          <stop offset="45%" stopColor="#fd5949" />
          <stop offset="60%" stopColor="#d6249f" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5.5" fill={`url(#ig-${gid})`} />
      <circle cx="12" cy="12" r="4.35" fill="none" stroke="#fff" strokeWidth="1.7" />
      <circle cx="17.35" cy="6.65" r="1.15" fill="#fff" />
    </svg>
  );
}

function HubIcon({ children }: { children: ReactNode }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] border border-line bg-[rgb(var(--color-bg))] text-ink"
      aria-hidden
    >
      {children}
    </span>
  );
}

/**
 * Floating Today hub bubble — sibling UX to ProfileStack / LanguageMenu.
 * Toggle on Heute; outside click / Escape / × closes with exit animation.
 */
export function TodayHubMenu({ burst, burstKey, onBurst }: TodayHubMenuProps) {
  const { t } = useI18n();
  const { membership } = useAuth();
  const showRadar = isTeamSeydaRadarOrg(membership?.org_id);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const active = pathInTodayHub(pathname);
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
    }, 280);
  };

  const openMenu = () => {
    onBurst();
    triggerNavHaptic(150);
    setClosing(false);
    setExpanded(true);
  };

  const onTodayTap = () => {
    if (expanded) {
      collapse();
      return;
    }
    if (!pathInTodayHub(pathname)) {
      void navigate('/');
    }
    openMenu();
  };

  const goSection = (hash: string) => {
    triggerNavHaptic(140);
    onBurst();
    void navigate({ pathname: '/', hash });
    collapse();
    window.setTimeout(() => {
      document.getElementById(hash.replace(/^#/, ''))?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 80);
  };

  const goRoute = (to: string) => {
    triggerNavHaptic(140);
    onBurst();
    void navigate(to);
    collapse();
  };

  const items: HubItem[] = [
    {
      id: 'plan',
      titleKey: 'todayHub.plan',
      subKey: 'todayHub.planSub',
      icon: (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <rect x="4" y="5" width="16" height="15" rx="2.5" />
          <path d="M8 3.5v3M16 3.5v3M4 10h16" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: 'priorities',
      titleKey: 'todayHub.priorities',
      subKey: 'todayHub.prioritiesSub',
      icon: (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path
            d="M12 3l2.2 4.6L19 8.4l-3.5 3.4.8 5.2L12 14.6 7.7 17l.8-5.2L5 8.4l4.8-.8L12 3z"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      id: 'content',
      titleKey: 'todayHub.content',
      subKey: 'todayHub.contentSub',
      featured: true,
      icon: <InstagramMark className="h-7 w-7" />,
    },
    ...(showRadar
      ? ([
          {
            id: 'radar',
            titleKey: 'todayHub.radar',
            subKey: 'todayHub.radarSub',
            icon: (
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                <circle cx="12" cy="12" r="2.2" />
                <circle cx="12" cy="12" r="5.4" />
                <circle cx="12" cy="12" r="8.6" />
                <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4" strokeLinecap="round" />
              </svg>
            ),
          },
        ] satisfies HubItem[])
      : []),
    {
      id: 'tasks',
      titleKey: 'todayHub.tasks',
      subKey: 'todayHub.tasksSub',
      icon: (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M9 6h11M9 12h11M9 18h11" strokeLinecap="round" />
          <path
            d="M5 6.2l1.2 1.2L8 5.5M5 12.2l1.2 1.2L8 11.5M5 18.2l1.2 1.2L8 17.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      id: 'stats',
      titleKey: 'todayHub.stats',
      subKey: 'todayHub.statsSub',
      icon: (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path d="M5 19V10M12 19V5M19 19v-7" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  const onItem = (id: HubItemId) => {
    switch (id) {
      case 'plan':
        goSection('#heute-tagesplan');
        break;
      case 'priorities':
        goSection('#heute-prioritaeten');
        break;
      case 'tasks':
        goSection('#heute-aufgaben');
        break;
      case 'stats':
        goRoute('/reise');
        break;
      case 'content':
        goRoute('/heute/content');
        break;
      case 'radar':
        goSection('#heute-radar');
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative flex w-full flex-col items-center">
      {open ? (
        <div
          className={`today-hub absolute bottom-[calc(100%+0.45rem)] left-0 z-50 w-[min(19.5rem,calc(100vw-1.5rem))] ${
            closing ? 'today-hub-out' : 'today-hub-in'
          }`}
          role="dialog"
          aria-modal="false"
          aria-labelledby={labelId}
        >
          <Card
            padding="none"
            className="today-hub__card overflow-hidden !shadow-[0_18px_44px_rgb(17_18_20/0.14)]"
          >
            <div className="flex items-start justify-between gap-2 border-b border-line px-3.5 py-3">
              <div className="min-w-0">
                <h2
                  id={labelId}
                  className="truncate text-[0.95rem] font-bold tracking-tight text-ink"
                >
                  {t('todayHub.title')}
                </h2>
                <p className="mt-0.5 truncate text-[0.72rem] text-muted">
                  {t('todayHub.subtitle')}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                fullWidth={false}
                aria-label={t('todayHub.close')}
                onClick={collapse}
                className="!h-8 !w-8 shrink-0 !rounded-full !text-muted"
              >
                <span aria-hidden className="text-lg leading-none">
                  ×
                </span>
              </Button>
            </div>

            <div
              className="flex flex-col gap-1 p-1.5"
              role="menu"
              aria-label={t('todayHub.menuAria')}
            >
              {items.map((item, i) =>
                item.featured ? (
                  <Button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    variant="ghost"
                    onClick={() => onItem(item.id)}
                    style={{ animationDelay: `${40 + i * 28}ms` }}
                    className="today-hub__item today-hub__item--featured !h-auto !justify-start !gap-2.5 !rounded-[0.9rem] !px-2.5 !py-2.5"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.8rem] bg-white shadow-[0_4px_14px_rgb(17_18_20/0.08)]">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="flex items-start gap-1.5">
                        <span className="text-[0.86rem] font-bold leading-[1.2] tracking-tight text-[rgb(70_48_28)]">
                          {t(item.titleKey)}
                        </span>
                        <span className="today-hub__sparkle mt-0.5 shrink-0" aria-hidden>
                          ✦
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[0.7rem] font-medium leading-snug text-muted">
                        {t(item.subKey)}
                      </span>
                    </span>
                    <span className="shrink-0 text-base text-muted" aria-hidden>
                      ›
                    </span>
                  </Button>
                ) : (
                  <Button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    variant="ghost"
                    onClick={() => onItem(item.id)}
                    style={{ animationDelay: `${40 + i * 28}ms` }}
                    className="today-hub__item !h-auto !justify-start !gap-2.5 !rounded-[0.85rem] !px-2.5 !py-2"
                  >
                    <HubIcon>{item.icon}</HubIcon>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[0.84rem] font-semibold text-ink">
                        {t(item.titleKey)}
                      </span>
                      <span className="mt-0.5 block truncate text-[0.7rem] text-muted">
                        {t(item.subKey)}
                      </span>
                    </span>
                    <span className="shrink-0 text-base text-muted" aria-hidden>
                      ›
                    </span>
                  </Button>
                )
              )}
            </div>
          </Card>
        </div>
      ) : null}

      <LiquidChampagne className="w-full justify-center">
        <Button
          type="button"
          variant="ghost"
          fullWidth
          aria-label={t('nav.today')}
          aria-expanded={expanded}
          aria-haspopup="dialog"
          onClick={onTodayTap}
          className={[
            '!h-auto !flex-col !items-center !justify-end !gap-1 !rounded-xl !px-1 !py-1 !shadow-none',
            active || expanded ? '!text-accent-deep' : '!text-muted',
          ].join(' ')}
        >
          <span
            className={[
              'nav-icon-active-glow will-change-transform',
              expanded || closing ? 'today-hub-anchor' : '',
            ].join(' ')}
          >
            <TodayIcon key={`heute-${burstKey}`} active={active || expanded} burst={burst} />
          </span>
          <span
            className={[
              'text-[10px] tracking-[0.14em] transition-[color,font-weight] duration-150',
              active || expanded ? 'font-bold text-accent-deep' : 'font-medium text-muted',
            ].join(' ')}
          >
            {t('nav.today')}
          </span>
        </Button>
      </LiquidChampagne>
    </div>
  );
}
