import { useState } from 'react';
import { useI18n } from '@shared/i18n';
import { useAuth } from '@shared/auth/AuthProvider';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Select } from '@shared/ui/Select';
import {
  useCreateOrgInvite,
  useOrgAdminInvites,
  useOrgAdminMembers,
  useSetMembershipRole,
  useSetMembershipStatus,
} from './orgAdminApi';

const ROLES = ['berater', 'leader', 'admin', 'super_admin'] as const;
const STATUSES = ['active', 'suspended', 'ended'] as const;

export function OrgAdminMembersPage() {
  const { t } = useI18n();
  const { isSuperAdmin, membership: activeMembership } = useAuth();
  const { data, isPending, isError } = useOrgAdminMembers();
  const setRole = useSetMembershipRole();
  const setStatus = useSetMembershipStatus();
  const invites = useOrgAdminInvites();
  const createInvite = useCreateOrgInvite();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState('berater');

  const roleOptions = isSuperAdmin ? ROLES : (['berater', 'leader', 'admin'] as const);

  const onInvite = async () => {
    const row = await createInvite.mutateAsync(inviteRole);
    if (row?.invite_code) {
      setInviteLink(`${window.location.origin}/registrieren?code=${row.invite_code}`);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="font-semibold">{t('orgAdmin.members.inviteTitle')}</p>
        <p className="text-sm text-muted">{t('orgAdmin.members.inviteHint')}</p>
        <Select
          label={t('orgAdmin.members.inviteRole')}
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value)}
        >
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        {createInvite.isError ? (
          <Alert tone="error">{createInvite.error?.message || t('orgAdmin.saveFailed')}</Alert>
        ) : null}
        {inviteLink ? (
          <p className="break-all rounded-xl bg-bg px-3 py-2 font-mono text-xs">{inviteLink}</p>
        ) : null}
        <Button onClick={() => void onInvite()} disabled={createInvite.isPending}>
          {createInvite.isPending ? t('common.saving') : t('orgAdmin.members.createInvite')}
        </Button>
      </Card>

      <Card>
        <p className="font-semibold">{t('orgAdmin.members.listTitle')}</p>
        {isPending ? <p className="mt-3 text-sm text-muted">{t('common.loading')}</p> : null}
        {isError ? <p className="mt-3 text-sm text-muted">{t('orgAdmin.loadFailed')}</p> : null}
        {!isPending && data && data.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('orgAdmin.empty.members')}</p>
        ) : null}
        <ul className="mt-2">
          {data?.map((row) => {
            const name =
              [row.first_name, row.last_name].filter(Boolean).join(' ') ||
              row.username ||
              row.membership.identity_id.slice(0, 8);
            const isSelf = row.membership.id === activeMembership?.id;
            return (
              <li key={row.membership.id} className="org-admin__member">
                <div className="org-admin__member-row">
                  <div>
                    <p className="font-medium">{name}</p>
                    <p className="text-xs text-muted">
                      @{row.username || '—'} · {row.membership.role} · {row.membership.status}
                    </p>
                  </div>
                </div>
                <div className="org-admin__actions">
                  <Select
                    label={t('orgAdmin.members.role')}
                    value={row.membership.role}
                    disabled={
                      setRole.isPending || (row.membership.role === 'super_admin' && !isSuperAdmin)
                    }
                    onChange={(e) =>
                      void setRole.mutateAsync({
                        membershipId: row.membership.id,
                        role: e.target.value,
                      })
                    }
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                    {!ROLES.includes(row.membership.role as (typeof ROLES)[number]) ? (
                      <option value={row.membership.role}>{row.membership.role}</option>
                    ) : null}
                  </Select>
                  <Select
                    label={t('orgAdmin.members.status')}
                    value={row.membership.status}
                    disabled={setStatus.isPending || isSelf}
                    onChange={(e) =>
                      void setStatus.mutateAsync({
                        membershipId: row.membership.id,
                        status: e.target.value,
                      })
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </div>
              </li>
            );
          })}
        </ul>
        {(setRole.isError || setStatus.isError) && (
          <Alert tone="error">
            {setRole.error?.message || setStatus.error?.message || t('orgAdmin.saveFailed')}
          </Alert>
        )}
      </Card>

      <Card>
        <p className="font-semibold">{t('orgAdmin.members.invitesTitle')}</p>
        {invites.data && invites.data.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm">
            {invites.data.map((inv) => (
              <li key={inv.code} className="flex justify-between gap-2">
                <span className="font-mono text-xs">{inv.code}</span>
                <span className="text-muted">
                  {inv.role}
                  {inv.used_at ? ` · ${t('orgAdmin.members.used')}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">{t('orgAdmin.empty.invites')}</p>
        )}
      </Card>
    </div>
  );
}
