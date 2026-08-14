import { useI18n } from '@shared/i18n';
import { useAuth } from '@shared/auth/AuthProvider';
import { Card } from '@shared/ui/Card';
import { ButtonLink } from '@shared/ui/ButtonLink';

export function OrgAdminKnowledgeHubPage() {
  const { t } = useI18n();
  const { canManageCoachContent, isSuperAdmin } = useAuth();
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="font-semibold">{t('orgAdmin.knowledge.title')}</p>
        <p className="text-sm text-muted">{t('orgAdmin.knowledge.body')}</p>
        {canManageCoachContent ? (
          <ButtonLink to="/knowledge-center" variant="secondary">
            {t('orgAdmin.knowledge.openCms')}
          </ButtonLink>
        ) : (
          <p className="text-sm text-muted">{t('orgAdmin.unavailable')}</p>
        )}
        {isSuperAdmin ? (
          <ButtonLink to="/wissen" variant="ghost">
            {t('orgAdmin.knowledge.openRag')}
          </ButtonLink>
        ) : null}
      </Card>
    </div>
  );
}

export function OrgAdminContentHubPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="font-semibold">{t('orgAdmin.content.title')}</p>
        <p className="text-sm text-muted">{t('orgAdmin.content.body')}</p>
        <p className="text-sm text-muted">{t('orgAdmin.content.autopilotNote')}</p>
        <ButtonLink to="/heute/content" variant="secondary">
          {t('orgAdmin.content.open')}
        </ButtonLink>
      </Card>
    </div>
  );
}

export function OrgAdminLiveHubPage() {
  const { t } = useI18n();
  const { canManageCoachContent } = useAuth();
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="font-semibold">{t('orgAdmin.live.title')}</p>
        <p className="text-sm text-muted">{t('orgAdmin.live.body')}</p>
        {canManageCoachContent ? (
          <ButtonLink to="/live-coaching" variant="secondary">
            {t('orgAdmin.live.open')}
          </ButtonLink>
        ) : (
          <p className="text-sm text-muted">{t('orgAdmin.unavailable')}</p>
        )}
      </Card>
    </div>
  );
}

export function OrgAdminStoriesHubPage() {
  const { t } = useI18n();
  const { canManageCoachContent } = useAuth();
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="font-semibold">{t('orgAdmin.stories.title')}</p>
        <p className="text-sm text-muted">{t('orgAdmin.stories.body')}</p>
        {canManageCoachContent ? (
          <ButtonLink to="/stories" variant="secondary">
            {t('orgAdmin.stories.open')}
          </ButtonLink>
        ) : (
          <p className="text-sm text-muted">{t('orgAdmin.unavailable')}</p>
        )}
      </Card>
      <ButtonLink to="/admin" variant="ghost">
        {t('orgAdmin.back')}
      </ButtonLink>
    </div>
  );
}

export function PlatformAdminDeniedPage() {
  const { t } = useI18n();
  return (
    <Card className="space-y-2">
      <p className="font-semibold">{t('orgAdmin.platformDeniedTitle')}</p>
      <p className="text-sm text-muted">{t('orgAdmin.platformDeniedBody')}</p>
      <ButtonLink to="/more" variant="secondary">
        {t('orgAdmin.backMore')}
      </ButtonLink>
    </Card>
  );
}

export function OrgAdminForbiddenPage() {
  const { t } = useI18n();
  return (
    <Card className="space-y-2">
      <p className="font-semibold">{t('orgAdmin.forbiddenTitle')}</p>
      <p className="text-sm text-muted">{t('orgAdmin.forbiddenBody')}</p>
      <ButtonLink to="/more" variant="secondary">
        {t('orgAdmin.backMore')}
      </ButtonLink>
    </Card>
  );
}
