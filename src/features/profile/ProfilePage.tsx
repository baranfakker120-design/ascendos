import { Link } from 'react-router-dom';
import { useAuth } from '@shared/auth/AuthProvider';
import { resolveDisplayFrameKey } from '@shared/lib/frameAssets';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { EnergyCore } from '@shared/ui/EnergyCore';
import { RankChip } from '@shared/ui/RankChip';
import { RankFrame } from '@shared/ui/RankFrame';
import { RoleBadge } from '@shared/ui/RoleBadge';
import { StatCard, formatStatNumber } from '@shared/ui/StatCard';
import { useProfileDetail } from './profileApi';

/**
 * Eigenes Profil: Identität, Rang/AP, geschäftlicher Kontext.
 */
export function ProfilePage() {
  const { role: membershipRole } = useAuth();
  const { data, isLoading, isError } = useProfileDetail();

  if (isLoading) {
    return <p className="text-sm text-muted">Profil wird geladen …</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-muted">Profil konnte nicht geladen werden.</p>;
  }

  const { profile, context, rank } = data;
  const displayName = `${profile.first_name} ${profile.last_name}`.trim();
  const currentLabel = rank.current?.label ?? null;
  const displayFrameKey = resolveDisplayFrameKey({
    role: membershipRole,
    rankFrameKey: rank.current?.frame_asset ?? null,
    isBeraterDesMonats: rank.isBeraterDesMonats,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Profil</h1>

      <Card className="flex flex-col items-center gap-4 text-center">
        <RankFrame
          frameKey={displayFrameKey}
          src={profile.avatar_url}
          name={displayName || profile.username}
          size="lg"
        />
        <div>
          <p className="text-xl font-semibold">{displayName}</p>
          <p className="text-sm text-muted">@{profile.username}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {currentLabel ? (
            <RankChip label={currentLabel} frameKey={displayFrameKey} variant="framed" />
          ) : null}
          <RoleBadge role={membershipRole} />
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

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Aktuelle AP" value={formatStatNumber(rank.apTotal)} />
        <StatCard label="Aktueller Rang" value={currentLabel} />
        <StatCard label="Organisation" value={context.orgName} />
        <StatCard
          label="Rolle"
          value={<RoleBadge role={membershipRole} className="mt-0.5" />}
        />
      </div>

      <Card>
        <p className="font-semibold">Geschäftskontext</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Team</dt>
            <dd className="font-medium">{context.teamName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Sponsor</dt>
            <dd className="font-medium">{context.sponsorName ?? 'Gründungsmitglied'}</dd>
          </div>
        </dl>
      </Card>

      <Link to="/profil/bearbeiten" className="block">
        <Button type="button" variant="secondary">
          Profil bearbeiten
        </Button>
      </Link>
    </div>
  );
}
