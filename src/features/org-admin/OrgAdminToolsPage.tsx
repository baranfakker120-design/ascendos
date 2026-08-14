import { useState } from 'react';
import { useI18n } from '@shared/i18n';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';
import { useOrgAdminTools, useUpsertOrgTool } from './orgAdminApi';

export function OrgAdminToolsPage() {
  const { t } = useI18n();
  const { data, isPending } = useOrgAdminTools();
  const upsert = useUpsertOrgTool();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');

  const onSave = async () => {
    await upsert.mutateAsync({ key, name, url, description });
    setKey('');
    setName('');
    setUrl('');
    setDescription('');
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="font-semibold">{t('orgAdmin.tools.addTitle')}</p>
        <p className="text-sm text-muted">{t('orgAdmin.tools.hint')}</p>
        <Input
          label={t('orgAdmin.tools.key')}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <Input
          label={t('orgAdmin.tools.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label={t('orgAdmin.tools.url')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Input
          label={t('orgAdmin.tools.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {upsert.isError ? (
          <Alert tone="error">{upsert.error?.message || t('orgAdmin.saveFailed')}</Alert>
        ) : null}
        <Button onClick={() => void onSave()} disabled={upsert.isPending || !key || !url}>
          {upsert.isPending ? t('common.saving') : t('orgAdmin.tools.save')}
        </Button>
      </Card>

      <Card>
        <p className="font-semibold">{t('orgAdmin.tools.listTitle')}</p>
        {isPending ? <p className="mt-3 text-sm text-muted">{t('common.loading')}</p> : null}
        {!isPending && (!data || data.length === 0) ? (
          <p className="mt-3 text-sm text-muted">{t('orgAdmin.empty.tools')}</p>
        ) : null}
        <ul className="mt-3 space-y-3">
          {data?.map((tool) => (
            <li key={tool.id} className="rounded-xl border border-line px-3 py-2">
              <p className="font-medium">
                {tool.name} <span className="text-xs text-muted">({tool.key})</span>
              </p>
              <p className="mt-1 break-all text-xs text-muted">{tool.url}</p>
              <p className="mt-1 text-xs text-muted">
                {tool.is_active ? t('orgAdmin.tools.active') : t('orgAdmin.tools.inactive')}
              </p>
              <div className="mt-2">
                <Button
                  variant="secondary"
                  fullWidth={false}
                  onClick={() =>
                    void upsert.mutateAsync({
                      key: tool.key,
                      name: tool.name,
                      url: tool.url,
                      description: tool.description ?? undefined,
                      sort_order: tool.sort_order,
                      is_active: !tool.is_active,
                    })
                  }
                >
                  {tool.is_active ? t('orgAdmin.tools.deactivate') : t('orgAdmin.tools.activate')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
