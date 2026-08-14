import { useI18n } from '@shared/i18n';
import { useActiveOrganizationProfile } from '@shared/org/useActiveOrganizationProfile';
import { Card } from '@shared/ui/Card';

export function OrgAdminOrganizationPage() {
  const { t } = useI18n();
  const { profile, isPending } = useActiveOrganizationProfile();

  if (isPending) {
    return (
      <Card>
        <p className="text-sm text-muted">{t('common.loading')}</p>
      </Card>
    );
  }

  if (!profile) {
    return (
      <Card>
        <p className="font-medium">{t('orgAdmin.empty.organization')}</p>
      </Card>
    );
  }

  const b = profile.branding;

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {t('orgAdmin.org.internalName')}
          </p>
          <p className="mt-1 font-semibold">{profile.name}</p>
          <p className="mt-1 text-xs text-muted">{t('orgAdmin.org.internalNameHint')}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {t('orgAdmin.org.displayName')}
          </p>
          <p className="mt-1 font-semibold">{profile.displayName}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {t('orgAdmin.org.website')}
          </p>
          <p className="mt-1 text-sm">{(b.website as string) || t('orgAdmin.notSet')}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {t('orgAdmin.org.support')}
          </p>
          <p className="mt-1 text-sm">{(b.supportUrl as string) || t('orgAdmin.notSet')}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {t('orgAdmin.org.guide')}
          </p>
          <p className="mt-1 break-all text-sm">{profile.guideUrl || t('orgAdmin.notSet')}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {t('orgAdmin.org.coach')}
          </p>
          <p className="mt-1 text-sm">{profile.coachDisplayName || t('orgAdmin.notSet')}</p>
        </div>
      </Card>
    </div>
  );
}
