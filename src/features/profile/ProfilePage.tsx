import { Link } from 'react-router-dom';
import { useAuth } from '@shared/auth/AuthProvider';
import { useI18n } from '@shared/i18n';
import { resolveDisplayFrameKey } from '@shared/lib/frameAssets';
import { Alert } from '@shared/ui/Alert';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { EnergyCore } from '@shared/ui/EnergyCore';
import { RankChip } from '@shared/ui/RankChip';
import { RankFrame } from '@shared/ui/RankFrame';
import { RoleBadge } from '@shared/ui/RoleBadge';
import { StatCard, formatStatNumber } from '@shared/ui/StatCard';
import { FrameCollection } from './FrameCollection';
import { RankUpOverlay } from './RankUpOverlay';
import { profileDetailFromAuth, useProfileDetail } from './profileApi';

/**
 * Eigenes Profil: Identität, Rang/AP, Rahmen-Sammlung, geschäftlicher Kontext.
 * Bei Ladefehlern bleibt das Layout immer sichtbar — Fehler nur als Inline-Banner.
 */
export function ProfilePage() {
  const { t } = useI18n();
  const { profile: authProfile, membership, role: membershipRole } = useAuth();
  const { data, isPending, isError, refetch, isFetching } = useProfileDetail();

  if (isPending && !data && !authProfile) {
    return <p className="text-sm text-muted">{t('profile.loading')}</p>;
  }

  // Never replace the page with a lone error string — always keep the shell.
  const detail =
    data ??
    profileDetailFromAuth(
      authProfile ?? {
        id: '',
        first_name: '',
        last_name: '',
        username: '—',
        phone: null,
        country: null,
        language: 'de',
        avatar_url: null,
        org_id: '',
        team_id: '',
        sponsor_id: null,
        role: 'berater',
        goals: {},
        created_at: '',
        updated_at: '',
      },
      membership
    );

  // Banner for hard failure / empty shell — not for silent rank soft-fallback.
  const showLoadBanner =
    (!isPending && (isError || !data)) ||
    data?.loadWarning === 'profile_partial' ||
    data?.loadWarning === 'rank_unavailable';

  const { profile, context, rank } = detail;
  const displayName = `${profile.first_name} ${profile.last_name}`.trim();
  const currentLabel = rank.current?.label ?? null;
  const rankKey = rank.current?.key ?? null;
  const displayFrameKey = resolveDisplayFrameKey({
    role: membershipRole,
    rankFrameKey: rank.current?.frame_asset ?? null,
    isBeraterDesMonats: rank.isBeraterDesMonats,
    equippedFrameKey: rank.equippedFrameKey,
  });

  return (
    <div className="space-y-4">
      {showLoadBanner ? <Alert tone="error">{t('profile.loadError')}</Alert> : null}
      {showLoadBanner ? (
        <Button
          type="button"
          variant="secondary"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          {isFetching ? t('profile.loading') : t('common.retry')}
        </Button>
      ) : null}

      <RankUpOverlay
        membershipId={rank.membershipId}
        rankKey={rankKey}
        rankLabel={currentLabel}
        frameKey={displayFrameKey}
        avatarUrl={profile.avatar_url}
        displayName={displayName || profile.username}
      />

      <h1 className="text-2xl font-bold">{t('profile.title')}</h1>

      <Card className="flex flex-col items-center gap-4 text-center">
        <RankFrame
          frameKey={displayFrameKey}
          src={profile.avatar_url}
          name={displayName || profile.username}
          size="lg"
        />
        <div>
          <p className="text-xl font-semibold">{displayName || profile.username}</p>
          <p className="text-sm text-muted">@{profile.username}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {currentLabel ? (
            <RankChip label={currentLabel} frameKey={displayFrameKey} variant="framed" />
          ) : null}
          <RoleBadge role={membershipRole} />
          {rank.isBeraterDesMonats ? (
            <span className="rounded-full border border-accent/40 bg-accent/15 px-2.5 py-1 text-[0.7rem] font-semibold text-accent-deep">
              {t('profile.beraterDesMonats')}
            </span>
          ) : null}
        </div>
      </Card>

      <Card>
        <EnergyCore
          ap={rank.apTotal}
          currentThreshold={rank.current?.threshold_ap ?? 0}
          nextThreshold={rank.next?.threshold_ap ?? null}
          nextRankLabel={rank.next?.label ?? null}
          size="lg"
        />
      </Card>

      <FrameCollection />

      <div className="grid grid-cols-2 gap-3">
        <StatCard label={t('profile.ap')} value={formatStatNumber(rank.apTotal)} />
        <StatCard label={t('profile.rank')} value={currentLabel} />
        <StatCard label={t('profile.org')} value={context.orgName} />
        <StatCard
          label={t('profile.role')}
          value={<RoleBadge role={membershipRole} className="mt-0.5" />}
        />
      </div>

      <Card>
        <p className="font-semibold">{t('profile.businessContext')}</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">{t('profile.team')}</dt>
            <dd className="font-medium">{context.teamName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">{t('profile.sponsor')}</dt>
            <dd className="font-medium">{context.sponsorName ?? t('profile.foundingMember')}</dd>
          </div>
        </dl>
      </Card>

      <Link to="/profil/bearbeiten" className="block">
        <Button type="button" variant="secondary">
          {t('profile.edit')}
        </Button>
      </Link>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t('firstLaunch.helpEyebrow')}
        </p>
        <p className="mt-1 font-semibold">{t('firstLaunch.helpTitle')}</p>
        <p className="mt-1 text-sm text-muted">{t('firstLaunch.helpBody')}</p>
        <Link to="/hilfe/installation" className="mt-3 block">
          <Button type="button" variant="secondary">
            {t('firstLaunch.openGuide')}
          </Button>
        </Link>
      </Card>
    </div>
  );
}
