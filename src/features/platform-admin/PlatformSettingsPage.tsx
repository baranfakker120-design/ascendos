import { useI18n } from '@shared/i18n';
import { Card } from '@shared/ui/Card';
import { useAuth } from '@shared/auth/AuthProvider';
import { usePlatformConfig } from './platformAdminApi';

const LABELS = {
  supabase: 'platformAdmin.settings.supabase',
  ai_provider: 'platformAdmin.settings.ai',
  instagram: 'platformAdmin.settings.instagram',
  push: 'platformAdmin.settings.push',
  billing: 'platformAdmin.settings.billing',
} as const;

type ConfigKey = keyof typeof LABELS;

export function PlatformSettingsPage() {
  const { t } = useI18n();
  const { isPlatformSuperAdmin } = useAuth();
  const config = usePlatformConfig(isPlatformSuperAdmin);

  if (config.isError) {
    return <p className="text-sm text-danger">{(config.error as Error).message}</p>;
  }

  const entries = Object.entries(config.data ?? {}).filter((entry): entry is [ConfigKey, string] =>
    Object.prototype.hasOwnProperty.call(LABELS, entry[0])
  );

  return (
    <div className="space-y-4">
      <p className="platform-admin__muted">{t('platformAdmin.settings.hint')}</p>
      <div className="platform-admin__grid platform-admin__grid--2">
        {entries.map(([key, value]) => (
          <Card key={key} className="space-y-1">
            <p className="text-sm text-muted">{t(LABELS[key])}</p>
            <p className="font-semibold">{value}</p>
          </Card>
        ))}
        {config.isLoading ? (
          <p className="platform-admin__muted">{t('platformAdmin.loading')}</p>
        ) : null}
      </div>
      <Card className="space-y-2">
        <p className="font-semibold">{t('platformAdmin.settings.secretsTitle')}</p>
        <p className="platform-admin__muted">{t('platformAdmin.settings.secretsBody')}</p>
      </Card>
    </div>
  );
}
