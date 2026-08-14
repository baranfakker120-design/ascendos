import { FormEvent, useState } from 'react';
import { useI18n } from '@shared/i18n';
import { Card } from '@shared/ui/Card';
import { Button } from '@shared/ui/Button';
import { useAuth } from '@shared/auth/AuthProvider';
import { usePlatformAdmins, useAddPlatformAdmin, useRevokePlatformAdmin } from './platformAdminApi';

export function PlatformAdminsPage() {
  const { t } = useI18n();
  const { isPlatformSuperAdmin } = useAuth();
  const list = usePlatformAdmins(isPlatformSuperAdmin);
  const add = useAddPlatformAdmin();
  const revoke = useRevokePlatformAdmin();
  const [identityId, setIdentityId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await add.mutateAsync({ identityId: identityId.trim(), notes: notes.trim() || undefined });
      setIdentityId('');
      setNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('platformAdmin.admins.failed'));
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <form className="platform-admin__form" onSubmit={onAdd}>
          <p className="font-semibold">{t('platformAdmin.admins.addTitle')}</p>
          <p className="platform-admin__muted">{t('platformAdmin.admins.addHint')}</p>
          <div className="platform-admin__field">
            <label htmlFor="pa-admin-id">{t('platformAdmin.admins.identityId')}</label>
            <input
              id="pa-admin-id"
              value={identityId}
              onChange={(e) => setIdentityId(e.target.value)}
              required
              pattern="[0-9a-fA-F-]{36}"
            />
          </div>
          <div className="platform-admin__field">
            <label htmlFor="pa-admin-notes">{t('platformAdmin.admins.notes')}</label>
            <input id="pa-admin-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" disabled={add.isPending}>
            {t('platformAdmin.admins.add')}
          </Button>
        </form>
      </Card>

      <Card className="overflow-x-auto">
        <table className="platform-admin__table">
          <thead>
            <tr>
              <th>{t('platformAdmin.admins.colName')}</th>
              <th>{t('platformAdmin.admins.colId')}</th>
              <th>{t('platformAdmin.admins.colStatus')}</th>
              <th>{t('platformAdmin.admins.colGranted')}</th>
              <th>{t('platformAdmin.admins.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((row) => {
              const label =
                [row.first_name, row.last_name].filter(Boolean).join(' ') ||
                row.username ||
                row.identity_id.slice(0, 8);
              return (
                <tr key={row.id}>
                  <td>{label}</td>
                  <td>
                    <code className="text-xs">{row.identity_id}</code>
                  </td>
                  <td>{row.is_active ? 'active' : 'revoked'}</td>
                  <td>{new Date(row.granted_at).toLocaleDateString()}</td>
                  <td>
                    {row.is_active ? (
                      <Button
                        type="button"
                        variant="ghost"
                        fullWidth={false}
                        disabled={
                          revoke.isPending ||
                          (list.data ?? []).filter((a) => a.is_active).length <= 1
                        }
                        onClick={() => {
                          setError(null);
                          void revoke
                            .mutateAsync(row.identity_id)
                            .catch((err: Error) => setError(err.message));
                        }}
                      >
                        {t('platformAdmin.admins.revoke')}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.isLoading ? (
          <p className="platform-admin__muted">{t('platformAdmin.loading')}</p>
        ) : null}
      </Card>
    </div>
  );
}
