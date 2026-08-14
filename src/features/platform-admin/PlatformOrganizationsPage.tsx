import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '@shared/i18n';
import { Card } from '@shared/ui/Card';
import { Button } from '@shared/ui/Button';
import { useAuth } from '@shared/auth/AuthProvider';
import {
  usePlatformOrganizations,
  useCreateOrganization,
  useSetOrganizationStatus,
} from './platformAdminApi';

export function PlatformOrganizationsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isPlatformSuperAdmin } = useAuth();
  const list = usePlatformOrganizations(isPlatformSuperAdmin);
  const create = useCreateOrganization();
  const setStatus = useSetOrganizationStatus();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [website, setWebsite] = useState('');
  const [supportUrl, setSupportUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      const org = await create.mutateAsync({
        name: name.trim(),
        displayName: displayName.trim() || name.trim(),
        website: website.trim() || undefined,
        supportUrl: supportUrl.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
      });
      setShowForm(false);
      setName('');
      setDisplayName('');
      setWebsite('');
      setSupportUrl('');
      setLogoUrl('');
      navigate(`/platform-admin/organizations/${org.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('platformAdmin.createFailed'));
    }
  }

  return (
    <div className="space-y-4">
      <div className="platform-admin__actions">
        <Button type="button" onClick={() => setShowForm((v) => !v)}>
          {t('platformAdmin.orgs.create')}
        </Button>
      </div>

      {showForm ? (
        <Card>
          <form className="platform-admin__form" onSubmit={onCreate}>
            <div className="platform-admin__field">
              <label htmlFor="pa-org-name">{t('platformAdmin.orgs.name')}</label>
              <input
                id="pa-org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
              />
            </div>
            <div className="platform-admin__field">
              <label htmlFor="pa-org-display">{t('platformAdmin.orgs.displayName')}</label>
              <input
                id="pa-org-display"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="platform-admin__field">
              <label htmlFor="pa-org-web">{t('platformAdmin.orgs.website')}</label>
              <input
                id="pa-org-web"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            <div className="platform-admin__field">
              <label htmlFor="pa-org-support">{t('platformAdmin.orgs.support')}</label>
              <input
                id="pa-org-support"
                value={supportUrl}
                onChange={(e) => setSupportUrl(e.target.value)}
              />
            </div>
            <div className="platform-admin__field">
              <label htmlFor="pa-org-logo">{t('platformAdmin.orgs.logo')}</label>
              <input
                id="pa-org-logo"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
              />
            </div>
            {formError ? <p className="text-sm text-danger">{formError}</p> : null}
            <div className="platform-admin__actions">
              <Button type="submit" disabled={create.isPending}>
                {t('platformAdmin.orgs.submit')}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {list.isError ? (
        <p className="text-sm text-danger">{(list.error as Error).message}</p>
      ) : null}

      <Card className="overflow-x-auto">
        <table className="platform-admin__table">
          <thead>
            <tr>
              <th>{t('platformAdmin.orgs.colName')}</th>
              <th>{t('platformAdmin.orgs.colDisplay')}</th>
              <th>{t('platformAdmin.orgs.colStatus')}</th>
              <th>{t('platformAdmin.orgs.colMembers')}</th>
              <th>{t('platformAdmin.orgs.colCreated')}</th>
              <th>{t('platformAdmin.orgs.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.display_name}</td>
                <td>
                  <span
                    className={`platform-admin__status platform-admin__status--${
                      row.status === 'active' ? 'active' : 'inactive'
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
                <td>{row.member_count}</td>
                <td>{new Date(row.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="platform-admin__actions">
                    <Link to={`/platform-admin/organizations/${row.id}`}>
                      {t('platformAdmin.orgs.open')}
                    </Link>
                    {row.status === 'active' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={setStatus.isPending}
                        onClick={() =>
                          void setStatus.mutateAsync({ orgId: row.id, status: 'inactive' })
                        }
                      >
                        {t('platformAdmin.orgs.deactivate')}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={setStatus.isPending}
                        onClick={() =>
                          void setStatus.mutateAsync({ orgId: row.id, status: 'active' })
                        }
                      >
                        {t('platformAdmin.orgs.reactivate')}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.isLoading ? <p className="platform-admin__muted">{t('platformAdmin.loading')}</p> : null}
        {!list.isLoading && (list.data ?? []).length === 0 ? (
          <p className="platform-admin__muted">{t('platformAdmin.orgs.empty')}</p>
        ) : null}
      </Card>
    </div>
  );
}
