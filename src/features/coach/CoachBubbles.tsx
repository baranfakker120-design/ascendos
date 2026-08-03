import type { ReactNode } from 'react';
import { useAuth } from '@shared/auth/AuthProvider';
import { resolveDisplayFrameKey } from '@shared/lib/frameAssets';
import { RankFrame } from '@shared/ui/RankFrame';
import { useProfileDetail } from '@features/profile/profileApi';
import './coach-chat.css';

export function CoachAvatar({ size = 40 }: { size?: number }) {
  return (
    <div className="coach-avatar" style={{ width: size, height: size }} aria-hidden>
      <img
        src="/brand/ascendos-symbol-mono-v2.png"
        alt=""
        className="coach-avatar__img"
        draggable={false}
      />
      <span className="coach-avatar__ring" />
    </div>
  );
}

/** User avatar with active RankFrame — same identity as Profile. */
export function CoachUserAvatar() {
  const { profile, role } = useAuth();
  const { data } = useProfileDetail();
  const name =
    profile != null
      ? `${profile.first_name} ${profile.last_name}`.trim() || profile.username
      : 'Du';
  const frameKey = resolveDisplayFrameKey({
    role,
    rankFrameKey: data?.rank.current?.frame_asset ?? null,
    isBeraterDesMonats: data?.rank.isBeraterDesMonats ?? false,
  });

  return (
    <div className="coach-user-avatar">
      <RankFrame frameKey={frameKey} src={profile?.avatar_url} name={name} size="xs" />
    </div>
  );
}

/** Apple-level typing indicator — three springy dots. */
export function CoachTypingDots() {
  return (
    <span className="coach-typing" aria-label="Ascent schreibt" role="status">
      <span className="coach-typing__dot" />
      <span className="coach-typing__dot" />
      <span className="coach-typing__dot" />
    </span>
  );
}

export function CoachBubble({
  children,
  pending = false,
}: {
  children?: ReactNode;
  pending?: boolean;
}) {
  return (
    <div className="coach-row coach-row--assistant coach-row--in">
      <div className="coach-avatar-wrap">
        <CoachAvatar />
      </div>
      <div
        className={`coach-bubble coach-bubble--assistant coach-bubble--pop ${pending ? 'coach-bubble--pending' : ''}`}
      >
        {pending ? <CoachTypingDots /> : children}
      </div>
    </div>
  );
}

export function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="coach-row coach-row--user coach-row--in">
      <div className="coach-bubble coach-bubble--user coach-bubble--pop">{children}</div>
      <div className="coach-user-avatar-wrap">
        <CoachUserAvatar />
      </div>
    </div>
  );
}
