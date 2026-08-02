import type { CSSProperties } from 'react';

export type NavIconProps = {
  active?: boolean;
  burst?: boolean;
  className?: string;
};

const base = 'h-6 w-6 shrink-0';

/** Heute — sunrise; water ripple on burst. */
export function TodayIcon({ active, burst, className = '' }: NavIconProps) {
  return (
    <span className={`relative inline-flex ${className}`}>
      {burst ? (
        <>
          <span className="nav-ripple nav-ripple-a" aria-hidden />
          <span className="nav-ripple nav-ripple-b" aria-hidden />
        </>
      ) : null}
      <svg
        className={`${base} ${active ? 'text-accent-deep' : 'text-muted'}`}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <path
          d="M12 3.2v1.6M7.05 5.05l1.13 1.13M16.95 5.05l-1.13 1.13M4.8 10h1.6M17.6 10h1.6M6.2 7.4l.9.9M17.8 7.4l-.9.9"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M7.2 12.2a4.8 4.8 0 0 1 9.6 0"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path d="M5 12.6h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path
          d="M8.2 15h7.6M9.4 17.2h5.2M10.6 19.2h2.8"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/** Kontakte — two people separate ~4px then reunite. */
export function ContactsIcon({ active, burst, className = '' }: NavIconProps) {
  return (
    <svg
      className={`${base} ${active ? 'text-accent-deep' : 'text-muted'} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <g className={burst ? 'nav-contacts-left' : undefined} style={{ transformOrigin: '8px 12px' }}>
        <circle cx="8.2" cy="8.2" r="2.15" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M4.4 17.6c.55-2.7 2.15-4.1 3.8-4.1s3.25 1.4 3.8 4.1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
      <g className={burst ? 'nav-contacts-right' : undefined} style={{ transformOrigin: '16px 12px' }}>
        <circle cx="15.8" cy="8.2" r="2.15" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M12 17.6c.55-2.7 2.15-4.1 3.8-4.1s3.25 1.4 3.8 4.1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** Team Seyda — three people draw together. */
export function TeamSeydaIcon({ active, burst, className = '' }: NavIconProps) {
  return (
    <svg
      className={`${base} ${active ? 'text-accent-deep' : 'text-muted'} ${burst ? 'nav-team-burst' : ''} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M5.2 6.8c2.2-1.8 5-2.7 6.8-2.7s4.6.9 6.8 2.7"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <g className="nav-team-left">
        <circle cx="6.4" cy="10.1" r="1.55" stroke="currentColor" strokeWidth="1.35" />
        <path
          d="M4.1 16.2c.35-1.7 1.35-2.55 2.3-2.55s1.95.85 2.3 2.55"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
      </g>
      <g className="nav-team-center">
        <circle cx="12" cy="9.4" r="1.85" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M8.9 16.6c.45-2.15 1.8-3.2 3.1-3.2s2.65 1.05 3.1 3.2"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </g>
      <g className="nav-team-right">
        <circle cx="17.6" cy="10.1" r="1.55" stroke="currentColor" strokeWidth="1.35" />
        <path
          d="M15.3 16.2c.35-1.7 1.35-2.55 2.3-2.55s1.95.85 2.3 2.55"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
      </g>
      <path
        d="M5.6 18.6c1.9 1.15 4.1 1.7 6.4 1.7s4.5-.55 6.4-1.7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="6.4" cy="18.85" r="0.55" fill="currentColor" />
      <circle cx="12" cy="19.35" r="0.55" fill="currentColor" />
      <circle cx="17.6" cy="18.85" r="0.55" fill="currentColor" />
    </svg>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Profil — ring draws clockwise, silhouette fades in. */
export function ProfileIcon({ active, burst, className = '' }: NavIconProps) {
  const animate = !!burst && !prefersReducedMotion();
  const ringStyle: CSSProperties | undefined = animate
    ? {
        strokeDasharray: 52,
        strokeDashoffset: 52,
        animation: 'nav-profile-ring 420ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }
    : undefined;
  const silStyle: CSSProperties | undefined = animate
    ? {
        opacity: 0,
        animation: 'nav-profile-sil 280ms cubic-bezier(0.16, 1, 0.3, 1) 220ms forwards',
      }
    : undefined;

  return (
    <svg
      className={`${base} ${active ? 'text-accent-deep' : 'text-muted'} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="8.25"
        stroke="currentColor"
        strokeWidth="1.45"
        style={ringStyle}
        transform="rotate(-90 12 12)"
      />
      <g style={silStyle}>
        <circle cx="12" cy="9.4" r="2.2" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M7.6 17.2c.7-2.45 2.35-3.7 4.4-3.7s3.7 1.25 4.4 3.7"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** Ascend center — existing brand logo only (never redesigned). */
export function AscendLogo({ active, burst, className = '' }: NavIconProps) {
  return (
    <img
      src="/brand/nav/ascend.png"
      alt=""
      aria-hidden
      draggable={false}
      className={`h-9 w-auto select-none ${burst ? 'nav-ascend-pulse' : ''} ${active ? 'nav-ascend-active' : ''} ${className}`}
    />
  );
}
