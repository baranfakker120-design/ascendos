import { useState } from 'react';
import { useI18n } from '@shared/i18n';
import { useActiveOrganizationProfile } from '@shared/org/useActiveOrganizationProfile';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { Input } from '@shared/ui/Input';
import { useOrgAdminAgents, useUpdateOrgAgent, useUpdateOrgBranding } from './orgAdminApi';

export function OrgAdminCoachPage() {
  const { t } = useI18n();
  const { profile } = useActiveOrganizationProfile();
  const { data, isPending } = useOrgAdminAgents();
  const updateAgent = useUpdateOrgAgent();
  const updateBranding = useUpdateOrgBranding();
  const [coachName, setCoachName] = useState(
    typeof profile?.branding.coachDisplayName === 'string' ? profile.branding.coachDisplayName : ''
  );
  const [drafts, setDrafts] = useState<Record<string, { name: string; system_prompt: string }>>({});

  const agentDraft = (key: string, name: string, prompt: string) =>
    drafts[key] ?? { name, system_prompt: prompt };

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="font-semibold">{t('orgAdmin.coach.displayTitle')}</p>
        <p className="text-sm text-muted">{t('orgAdmin.coach.displayHint')}</p>
        <Input
          label={t('orgAdmin.branding.coachDisplayName')}
          value={coachName}
          onChange={(e) => setCoachName(e.target.value)}
        />
        {updateBranding.isError ? (
          <Alert tone="error">{updateBranding.error?.message || t('orgAdmin.saveFailed')}</Alert>
        ) : null}
        <Button
          onClick={() => void updateBranding.mutateAsync({ coachDisplayName: coachName.trim() })}
          disabled={updateBranding.isPending}
        >
          {updateBranding.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </Card>

      <Card>
        <p className="font-semibold">{t('orgAdmin.coach.agentsTitle')}</p>
        <p className="mt-1 text-sm text-muted">{t('orgAdmin.coach.agentsHint')}</p>
        {isPending ? <p className="mt-3 text-sm text-muted">{t('common.loading')}</p> : null}
        {!isPending && (!data || data.length === 0) ? (
          <p className="mt-3 text-sm text-muted">{t('orgAdmin.empty.coach')}</p>
        ) : null}
        <ul className="mt-3 space-y-4">
          {data?.map((agent) => {
            const d = agentDraft(agent.key, agent.name, agent.system_prompt);
            return (
              <li key={agent.id} className="space-y-2 rounded-xl border border-line p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  {agent.key}
                </p>
                <Input
                  label={t('orgAdmin.coach.agentName')}
                  value={d.name}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [agent.key]: { ...d, name: e.target.value },
                    }))
                  }
                />
                <label className="block space-y-1.5">
                  <span className="block text-sm font-medium">{t('orgAdmin.coach.prompt')}</span>
                  <textarea
                    className="ui-input min-h-[120px] w-full"
                    value={d.system_prompt}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [agent.key]: { ...d, system_prompt: e.target.value },
                      }))
                    }
                  />
                </label>
                <Button
                  fullWidth={false}
                  onClick={() =>
                    void updateAgent.mutateAsync({
                      key: agent.key,
                      name: d.name,
                      system_prompt: d.system_prompt,
                    })
                  }
                  disabled={updateAgent.isPending}
                >
                  {t('common.save')}
                </Button>
              </li>
            );
          })}
        </ul>
        {updateAgent.isError ? (
          <Alert tone="error">{updateAgent.error?.message || t('orgAdmin.saveFailed')}</Alert>
        ) : null}
      </Card>
    </div>
  );
}
