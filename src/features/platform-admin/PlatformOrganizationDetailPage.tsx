import { useParams } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { Card } from '@shared/ui/Card';
import { Button } from '@shared/ui/Button';
import { ButtonLink } from '@shared/ui/ButtonLink';
import { useAuth } from '@shared/auth/AuthProvider';
import {
  usePlatformOrganization,
  useSetOrganizationStatus,
  useCreateOrgAdminInvite,
} from './platformAdminApi';
import { useState } from 'react';

export function PlatformOrganizationDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { t } = useI18n();
  const { isPlatformSuperAdmin } = useAuth();
  const detail = usePlatformOrganization(orgId, isPlatformSuperAdmin);
  const setStatus = useSetOrganizationStatus();
  const invite = useCreateOrgAdminInvite();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (detail.isLoading) {
    return <p className="platform-admin__muted">{t('platformAdmin.loading')}</p>;
  }

  if (detail.isError || !detail.data) {
    return (
      <Card className="space-y-2">
        <p className="font-semibold">{t('platformAdmin.notFoundTitle')}</p>
        <p className="platform-admin__muted">
          {(detail.error as Error | null)?.message ?? t('platformAdmin.notFoundBody')}
        </p>
        <ButtonLink to="/platform-admin/organizations" variant="secondary">
          {t('platformAdmin.backOrgs')}
        </ButtonLink>
      </Card>
    );
  }

  const d = detail.data;
  const status = d.status ?? d.organization.status;

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <p className="font-semibold text-xl">{d.display_name}</p>
        <p className="platform-admin__muted">{d.organization.name}</p>
        <p className="text-sm">
          ID: <code>{d.organization.id}</code>
        </p>
        <p>
          <span
            className={`platform-admin__status platform-admin__status--${
              status === 'active' ? 'active' : 'inactive'
            }`}
          >
            {status}
          </span>
        </p>
        <div className="platform-admin__actions">
          {status === 'active' ? (
            <Button
              type="button"
              variant="secondary"
              disabled={setStatus.isPending}
              onClick={() => {
                setActionError(null);
                void setStatus
                  .mutateAsync({ orgId: d.organization.id, status: 'inactive' })
                  .catch((err: Error) => setActionError(err.message));
              }}
            >
              {t('platformAdmin.orgs.deactivate')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              disabled={setStatus.isPending}
              onClick={() => {
                setActionError(null);
                void setStatus
                  .mutateAsync({ orgId: d.organization.id, status: 'active' })
                  .catch((err: Error) => setActionError(err.message));
              }}
            >
              {t('platformAdmin.orgs.reactivate')}
            </Button>
          )}
          <Button
            type="button"
            disabled={invite.isPending}
            onClick={() => {
              setActionError(null);
              void invite
                .mutateAsync(d.organization.id)
                .then((row) => setInviteCode(row.invite_code))
                .catch((err: Error) => setActionError(err.message));
            }}
          >
            {t('platformAdmin.orgs.inviteAdmin')}
          </Button>
        </div>
        {inviteCode ? (
          <p className="text-sm">
            {t('platformAdmin.orgs.inviteCreated')}: <code>{inviteCode}</code>
          </p>
        ) : null}
        {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}
      </Card>

      <div className="platform-admin__grid platform-admin__grid--2">
        {(
          [
            ['members', d.member_count],
            ['teams', d.team_count],
            ['tools', d.tool_count],
            ['agents', d.agent_count],
            ['knowledge', d.knowledge_docs],
            ['live', d.live_events],
            ['stories', d.stories],
            ['content', d.content_assets],
            ['instagram', d.instagram_connections],
            ['usage', d.usage_events],
          ] as const
        ).map(([key, value]) => (
          <Card key={key} className="space-y-1">
            <p className="text-sm text-muted">{t(`platformAdmin.detail.${key}`)}</p>
            <p className="text-xl font-bold">{value}</p>
          </Card>
        ))}
      </div>

      <Card className="space-y-1">
        <p className="font-semibold">{t('platformAdmin.detail.branding')}</p>
        <p className="platform-admin__muted">
          {d.branding_configured
            ? t('platformAdmin.detail.brandingYes')
            : t('platformAdmin.detail.brandingNo')}
        </p>
      </Card>

      <ButtonLink to="/platform-admin/organizations" variant="ghost">
        {t('platformAdmin.backOrgs')}
      </ButtonLink>
    </div>
  );
}
