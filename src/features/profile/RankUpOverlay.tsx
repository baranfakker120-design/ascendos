import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@shared/i18n';
import { RankFrame } from '@shared/ui/RankFrame';
import { Button } from '@shared/ui/Button';
import './rank-up-overlay.css';

const STORAGE_KEY = 'ascendos.rank-up.last-key.v1';

type Props = {
  membershipId: string | null;
  rankKey: string | null;
  rankLabel: string | null;
  frameKey: string | null;
  avatarUrl: string | null;
  displayName: string;
};

/**
 * One-shot celebration when the member's display rank key increases.
 * Persists last-seen key per membership in localStorage — no fake cinema stack.
 */
export function RankUpOverlay({
  membershipId,
  rankKey,
  rankLabel,
  frameKey,
  avatarUrl,
  displayName,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ready = useRef(false);

  useEffect(() => {
    if (!membershipId || !rankKey) return;
    const storageKey = `${STORAGE_KEY}:${membershipId}`;
    let previous: string | null = null;
    try {
      previous = window.localStorage.getItem(storageKey);
    } catch {
      previous = null;
    }

    if (previous == null) {
      try {
        window.localStorage.setItem(storageKey, rankKey);
      } catch {
        // ignore
      }
      ready.current = true;
      return;
    }

    if (previous !== rankKey) {
      setOpen(true);
      try {
        window.localStorage.setItem(storageKey, rankKey);
      } catch {
        // ignore
      }
    }
    ready.current = true;
  }, [membershipId, rankKey]);

  if (!open || !rankKey || !frameKey) return null;

  return (
    <div className="rank-up" role="dialog" aria-modal="true" aria-label={t('profile.rankUpTitle')}>
      <div className="rank-up__panel">
        <p className="rank-up__eyebrow">{t('profile.rankUpEyebrow')}</p>
        <RankFrame frameKey={frameKey} src={avatarUrl} name={displayName} size="md" />
        <h2 className="rank-up__title">{t('profile.rankUpTitle')}</h2>
        <p className="rank-up__label">{rankLabel ?? rankKey}</p>
        <Button type="button" fullWidth={false} onClick={() => setOpen(false)}>
          {t('common.continue')}
        </Button>
      </div>
    </div>
  );
}
