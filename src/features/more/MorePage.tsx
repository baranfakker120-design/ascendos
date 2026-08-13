import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import { useI18n } from '@shared/i18n';
import { useActiveOrganizationProfile } from '@shared/org/useActiveOrganizationProfile';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { ButtonLink } from '@shared/ui/ButtonLink';
import { Card } from '@shared/ui/Card';
import { displayShareTool } from '@shared/lib/shareToolsDisplay';
import type { FirstlineProgress } from '@shared/types/domain';

/**
 * More — business hub (org guide, Journey, Firstline, Invite, Tools, Resources).
 * System preferences live on Settings.
 */
export function MorePage() {
  const { profile, isSuperAdmin, canManageCoachContent, membership, needsOrgSelection } = useAuth();
  const { profile: orgProfile } = useActiveOrganizationProfile();
  const { t } = useI18n();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: firstlineProgress } = useQuery({
    queryKey: ['firstline-progress', membership?.org_id, profile?.id],
    enabled: !!profile && !!membership?.org_id,
    queryFn: async (): Promise<FirstlineProgress[]> => {
      const { data, error } = await supabase
        .from('firstline_journey_progress')
        .select('*')
        .order('completed_steps', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        user_id: row.user_id ?? '',
        first_name: row.first_name ?? '',
        username: row.username,
        journey_id: row.journey_id,
        journey_title: row.journey_title,
        completed_steps: row.completed_steps ?? 0,
        total_steps: row.total_steps ?? 0,
        current_day: row.current_day ?? 0,
        total_days: row.total_days ?? 0,
      }));
    },
  });

  const tools = (orgProfile?.tools ?? []).map(displayShareTool);
  const guideLabel = orgProfile?.displayName
    ? t('more.orgGuide', { name: orgProfile.displayName })
    : t('more.orgGuideGeneric');
  const showGuide = Boolean(orgProfile?.guideUrl);

  const createInvite = async () => {
    setBusy(true);
    setCopied(false);
    setInviteError(null);
    setInviteLink(null);

    if (needsOrgSelection || !membership) {
      setBusy(false);
      setInviteError(t('more.inviteNoMembership'));
      return;
    }

    const { data, error } = await supabase.rpc('create_invite', {});
    setBusy(false);
    if (error) {
      setInviteError(error.message || t('more.inviteFailed'));
      return;
    }
    if (!data?.[0]?.invite_code) {
      setInviteError(t('more.inviteMissing'));
      return;
    }
    setInviteLink(`${window.location.origin}/registrieren?code=${data[0].invite_code}`);
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
  };

  if (!profile) {
    return (
      <Card>
        <p className="font-medium">{t('more.loadingProfile')}</p>
        <p className="mt-1 text-sm text-muted">{t('more.loadingHint')}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
          {t('more.eyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{t('more.title')}</h1>
      </header>

      <Link to="/team" className="block">
        <Card className="flex items-center justify-between">
          <div>
            <p className="font-semibold">{t('more.leadership')}</p>
            <p className="mt-0.5 text-sm text-muted">{t('more.leadershipSub')}</p>
          </div>
          <span className="text-primary" aria-hidden>
            →
          </span>
        </Card>
      </Link>

      <Link to="/qualifikationen" className="block">
        <Card className="flex items-center justify-between">
          <div>
            <p className="font-semibold">{t('more.qualifications')}</p>
            <p className="mt-0.5 text-sm text-muted">{t('more.qualificationsSub')}</p>
          </div>
          <span className="text-primary" aria-hidden>
            →
          </span>
        </Card>
      </Link>

      {showGuide ? (
        <Link to="/guide" className="block">
          <Card className="flex items-center justify-between">
            <div>
              <p className="font-semibold">{guideLabel}</p>
              <p className="mt-0.5 text-sm text-muted">{t('more.orgGuideSub')}</p>
            </div>
            <span className="text-primary" aria-hidden>
              →
            </span>
          </Card>
        </Link>
      ) : null}

      <Link to="/reise" className="block">
        <Card className="flex items-center justify-between">
          <div>
            <p className="font-semibold">{t('more.journey')}</p>
            <p className="mt-0.5 text-sm text-muted">{t('more.journeySub')}</p>
          </div>
          <span className="text-primary" aria-hidden>
            →
          </span>
        </Card>
      </Link>

      <Card>
        <p className="font-semibold">{t('more.firstline')}</p>
        <p className="mt-0.5 text-xs text-muted">{t('more.firstlinePrivacy')}</p>
        {firstlineProgress && firstlineProgress.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {firstlineProgress.map((fp) => {
              const done = fp.completed_steps >= fp.total_steps;
              return (
                <li key={fp.user_id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{fp.first_name}</span>
                  <span
                    className={`shrink-0 ${done ? 'font-medium text-emerald-600' : 'text-muted'}`}
                  >
                    {done
                      ? t('more.firstlineDone')
                      : t('more.firstlineDays', {
                          current: fp.current_day,
                          total: fp.total_days,
                        })}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">{t('more.firstlineEmpty')}</p>
        )}
      </Card>

      <Card>
        <p className="font-semibold">{t('more.invite')}</p>
        <p className="mt-1 text-sm text-muted">{t('more.inviteBody')}</p>
        {inviteError ? (
          <div className="mt-3">
            <Alert tone="error">{inviteError}</Alert>
          </div>
        ) : null}
        {inviteLink ? (
          <div className="mt-3 space-y-2">
            <p className="break-all rounded-xl bg-bg px-3 py-2 font-mono text-xs">{inviteLink}</p>
            <Button variant="secondary" onClick={copyLink}>
              {copied ? t('common.copied') : t('more.copyLink')}
            </Button>
          </div>
        ) : (
          <div className="mt-3">
            <Button onClick={createInvite} disabled={busy || needsOrgSelection || !membership}>
              {busy ? t('more.inviteBusy') : t('more.inviteCta')}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <p className="font-semibold">{t('more.tools')}</p>
        <p className="mt-0.5 text-sm text-muted">{t('more.toolsSub')}</p>
        {tools.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {tools
              .filter((tool) => tool.key !== 'guide')
              .map((tool) => (
                <li key={tool.key}>
                  <a
                    href={tool.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm font-medium hover:bg-bg"
                  >
                    <span>{tool.name}</span>
                    <span className="text-muted" aria-hidden>
                      →
                    </span>
                  </a>
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">{t('more.toolsEmpty')}</p>
        )}
      </Card>

      <Card>
        <p className="font-semibold">{t('more.resources')}</p>
        <p className="mt-1 text-sm text-muted">{t('more.resourcesSub')}</p>
        {canManageCoachContent ? (
          <div className="mt-3 flex flex-col gap-2">
            <ButtonLink to="/knowledge-center" variant="secondary">
              {t('more.adminKnowledge')}
            </ButtonLink>
            <ButtonLink to="/live-coaching" variant="secondary">
              {t('more.adminLive')}
            </ButtonLink>
            <ButtonLink to="/stories" variant="secondary">
              {t('more.adminStories')}
            </ButtonLink>
            {isSuperAdmin ? (
              <ButtonLink to="/wissen" variant="ghost">
                {t('more.adminKnowledgeRag')}
              </ButtonLink>
            ) : null}
          </div>
        ) : isSuperAdmin ? (
          <ButtonLink to="/wissen" variant="secondary" className="mt-3">
            {t('more.adminKnowledgeShort')}
          </ButtonLink>
        ) : showGuide ? (
          <ButtonLink to="/guide" variant="secondary" className="mt-3">
            {guideLabel}
          </ButtonLink>
        ) : null}
      </Card>
    </div>
  );
}
