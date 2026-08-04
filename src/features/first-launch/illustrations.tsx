import type { ReactNode } from 'react';

/** Large, simple phone-browser illustrations for the install guide. */

type IllustProps = { className?: string };

function PhoneFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 280 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden
    >
      <rect
        x="48"
        y="16"
        width="184"
        height="288"
        rx="28"
        fill="var(--fl-phone-body)"
        stroke="var(--fl-phone-edge)"
        strokeWidth="3"
      />
      <rect x="66" y="40" width="148" height="220" rx="8" fill="var(--fl-phone-screen)" />
      <rect x="110" y="24" width="60" height="8" rx="4" fill="var(--fl-phone-notch)" />
      <circle cx="140" cy="284" r="12" stroke="var(--fl-phone-edge)" strokeWidth="2" />
      {children}
    </svg>
  );
}

export function IllustAndroidMenu({ className }: IllustProps) {
  return (
    <PhoneFrame className={className}>
      <circle cx="198" cy="52" r="10" fill="var(--fl-accent)" />
      <path
        d="M198 47v10M193 52h10"
        stroke="var(--fl-phone-screen)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="150"
        y="64"
        width="72"
        height="88"
        rx="8"
        fill="var(--fl-surface)"
        stroke="var(--fl-line)"
      />
      <rect x="158" y="74" width="40" height="6" rx="2" fill="var(--fl-muted)" />
      <rect x="158" y="88" width="56" height="6" rx="2" fill="var(--fl-muted)" />
      <rect x="158" y="102" width="48" height="6" rx="2" fill="var(--fl-accent)" />
      <rect x="158" y="116" width="52" height="6" rx="2" fill="var(--fl-muted)" />
      <circle
        cx="198"
        cy="52"
        r="18"
        stroke="var(--fl-accent)"
        strokeWidth="2"
        strokeDasharray="4 3"
        opacity="0.7"
      />
    </PhoneFrame>
  );
}

export function IllustAndroidAdd({ className }: IllustProps) {
  return (
    <PhoneFrame className={className}>
      <rect
        x="78"
        y="100"
        width="124"
        height="100"
        rx="12"
        fill="var(--fl-surface)"
        stroke="var(--fl-line)"
      />
      <rect x="94" y="118" width="36" height="36" rx="8" fill="var(--fl-accent)" opacity="0.85" />
      <rect x="140" y="122" width="48" height="8" rx="2" fill="var(--fl-ink)" />
      <rect x="140" y="138" width="40" height="6" rx="2" fill="var(--fl-muted)" />
      <rect x="94" y="168" width="92" height="18" rx="6" fill="var(--fl-accent)" />
      <path
        d="M130 176h20M140 171v10"
        stroke="var(--fl-phone-screen)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </PhoneFrame>
  );
}

export function IllustAndroidConfirm({ className }: IllustProps) {
  return (
    <PhoneFrame className={className}>
      <rect
        x="78"
        y="90"
        width="124"
        height="120"
        rx="12"
        fill="var(--fl-surface)"
        stroke="var(--fl-line)"
      />
      <rect x="98" y="110" width="84" height="10" rx="2" fill="var(--fl-ink)" />
      <rect
        x="98"
        y="132"
        width="84"
        height="28"
        rx="6"
        fill="var(--fl-phone-screen)"
        stroke="var(--fl-line)"
      />
      <rect x="98" y="172" width="40" height="20" rx="6" fill="var(--fl-muted)" opacity="0.4" />
      <rect x="142" y="172" width="40" height="20" rx="6" fill="var(--fl-accent)" />
    </PhoneFrame>
  );
}

export function IllustDone({ className }: IllustProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 280 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden
    >
      <rect x="40" y="40" width="200" height="240" rx="24" fill="var(--fl-home)" />
      <rect x="64" y="72" width="56" height="56" rx="14" fill="var(--fl-accent)" />
      <path
        d="M82 100l8 8 16-18"
        stroke="var(--fl-phone-screen)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="160"
        y="72"
        width="56"
        height="56"
        rx="14"
        fill="var(--fl-surface)"
        stroke="var(--fl-line)"
      />
      <rect
        x="64"
        y="148"
        width="56"
        height="56"
        rx="14"
        fill="var(--fl-surface)"
        stroke="var(--fl-line)"
      />
      <rect
        x="160"
        y="148"
        width="56"
        height="56"
        rx="14"
        fill="var(--fl-surface)"
        stroke="var(--fl-line)"
      />
      <circle cx="92" cy="250" r="6" fill="var(--fl-muted)" />
      <circle cx="140" cy="250" r="6" fill="var(--fl-muted)" />
      <circle cx="188" cy="250" r="6" fill="var(--fl-muted)" />
    </svg>
  );
}

export function IllustIosShare({ className }: IllustProps) {
  return (
    <PhoneFrame className={className}>
      <rect x="66" y="230" width="148" height="30" rx="6" fill="var(--fl-surface)" opacity="0.9" />
      <path
        d="M140 242v12M140 242l-6 6M140 242l6 6M132 254h16"
        stroke="var(--fl-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="140"
        cy="248"
        r="22"
        stroke="var(--fl-accent)"
        strokeWidth="2"
        strokeDasharray="4 3"
        opacity="0.7"
      />
    </PhoneFrame>
  );
}

export function IllustIosScroll({ className }: IllustProps) {
  return (
    <PhoneFrame className={className}>
      <rect
        x="78"
        y="70"
        width="124"
        height="160"
        rx="16"
        fill="var(--fl-surface)"
        stroke="var(--fl-line)"
      />
      <rect x="94" y="86" width="40" height="40" rx="10" fill="var(--fl-muted)" opacity="0.35" />
      <rect x="146" y="86" width="40" height="40" rx="10" fill="var(--fl-muted)" opacity="0.35" />
      <rect x="94" y="140" width="40" height="40" rx="10" fill="var(--fl-muted)" opacity="0.35" />
      <rect x="146" y="140" width="40" height="40" rx="10" fill="var(--fl-accent)" opacity="0.9" />
      <path
        d="M140 200v24M132 216l8 8 8-8"
        stroke="var(--fl-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </PhoneFrame>
  );
}

export function IllustIosHome({ className }: IllustProps) {
  return (
    <PhoneFrame className={className}>
      <rect
        x="78"
        y="70"
        width="124"
        height="160"
        rx="16"
        fill="var(--fl-surface)"
        stroke="var(--fl-line)"
      />
      <rect
        x="94"
        y="100"
        width="92"
        height="28"
        rx="8"
        fill="var(--fl-phone-screen)"
        stroke="var(--fl-line)"
      />
      <rect
        x="94"
        y="140"
        width="92"
        height="36"
        rx="8"
        fill="var(--fl-accent)"
        opacity="0.15"
        stroke="var(--fl-accent)"
      />
      <path
        d="M110 152h12v12h-12zM128 148v20M136 158h20"
        stroke="var(--fl-accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="148" y="148" width="28" height="20" rx="4" fill="var(--fl-accent)" opacity="0.35" />
    </PhoneFrame>
  );
}

export function IllustIosAdd({ className }: IllustProps) {
  return (
    <PhoneFrame className={className}>
      <rect
        x="78"
        y="80"
        width="124"
        height="140"
        rx="12"
        fill="var(--fl-surface)"
        stroke="var(--fl-line)"
      />
      <rect x="118" y="96" width="12" height="12" rx="2" fill="var(--fl-accent)" />
      <rect x="98" y="120" width="84" height="10" rx="2" fill="var(--fl-ink)" />
      <rect
        x="98"
        y="142"
        width="84"
        height="28"
        rx="6"
        fill="var(--fl-phone-screen)"
        stroke="var(--fl-line)"
      />
      <rect x="168" y="88" width="26" height="14" rx="4" fill="var(--fl-accent)" />
    </PhoneFrame>
  );
}

export function IllustWelcome({ className }: IllustProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 280 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden
    >
      <rect
        x="70"
        y="20"
        width="140"
        height="160"
        rx="24"
        fill="var(--fl-phone-body)"
        stroke="var(--fl-phone-edge)"
        strokeWidth="3"
      />
      <rect x="84" y="40" width="112" height="120" rx="8" fill="var(--fl-accent)" opacity="0.9" />
      <path
        d="M120 90l14 14 28-30"
        stroke="var(--fl-phone-screen)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="140" cy="172" r="8" stroke="var(--fl-phone-edge)" strokeWidth="2" />
    </svg>
  );
}

export function IllustAdvantages({ className }: IllustProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 280 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden
    >
      <rect
        x="24"
        y="40"
        width="64"
        height="80"
        rx="14"
        fill="var(--fl-surface)"
        stroke="var(--fl-line)"
      />
      <rect
        x="108"
        y="24"
        width="64"
        height="112"
        rx="14"
        fill="var(--fl-accent)"
        opacity="0.2"
        stroke="var(--fl-accent)"
      />
      <rect
        x="192"
        y="40"
        width="64"
        height="80"
        rx="14"
        fill="var(--fl-surface)"
        stroke="var(--fl-line)"
      />
      <circle cx="140" cy="80" r="18" fill="var(--fl-accent)" />
      <path
        d="M132 80l6 6 12-14"
        stroke="var(--fl-phone-screen)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
