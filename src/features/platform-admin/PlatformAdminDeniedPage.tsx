import { useI18n } from '@shared/i18n';
import { Card } from '@shared/ui/Card';
import { ButtonLink } from '@shared/ui/ButtonLink';

export function PlatformAdminDeniedPage() {
  const { t } = useI18n();
  return (
    <Card className="space-y-2">
      <p className="font-semibold">{t('platformAdmin.deniedTitle')}</p>
      <p className="text-sm text-muted">{t('platformAdmin.deniedBody')}</p>
      <ButtonLink to="/more" variant="secondary">
        {t('platformAdmin.backMore')}
      </ButtonLink>
    </Card>
  );
}
