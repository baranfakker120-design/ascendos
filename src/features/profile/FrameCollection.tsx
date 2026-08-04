import { useI18n } from '@shared/i18n';
import { RankFrame } from '@shared/ui/RankFrame';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { useEquipFrameCosmetic, useMyFrameCosmetics } from './cosmeticsApi';
import './frame-collection.css';

/**
 * Unlocked frames for the active membership — equip one AP/special frame.
 * Status frames (SA / Dev / Berater des Monats) still win in resolveDisplayFrameKey.
 */
export function FrameCollection() {
  const { t } = useI18n();
  const { data: frames = [], isPending, isError } = useMyFrameCosmetics();
  const equip = useEquipFrameCosmetic();

  if (isPending) {
    return (
      <Card>
        <p className="text-sm text-muted">{t('profile.framesLoading')}</p>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <p className="text-sm text-muted">{t('profile.framesLoadError')}</p>
      </Card>
    );
  }

  if (frames.length === 0) {
    return (
      <Card>
        <p className="font-semibold">{t('profile.framesTitle')}</p>
        <p className="mt-1 text-sm text-muted">{t('profile.framesEmpty')}</p>
      </Card>
    );
  }

  return (
    <Card>
      <p className="font-semibold">{t('profile.framesTitle')}</p>
      <p className="mt-1 text-sm text-muted">{t('profile.framesHint')}</p>
      <ul className="frame-collection" aria-label={t('profile.framesTitle')}>
        {frames.map((frame) => (
          <li key={frame.itemId} className="frame-collection__item">
            <RankFrame frameKey={frame.assetPath} src={null} name={frame.label} size="sm" />
            <div className="frame-collection__meta">
              <p className="frame-collection__label">{frame.label}</p>
              {frame.isEquipped ? (
                <p className="frame-collection__equipped">{t('profile.frameEquipped')}</p>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  fullWidth={false}
                  disabled={equip.isPending}
                  onClick={() => void equip.mutateAsync(frame.itemId)}
                >
                  {t('profile.frameEquip')}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
