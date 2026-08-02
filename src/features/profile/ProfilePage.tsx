import { Link } from 'react-router-dom';
import { useAuth } from '@shared/auth/AuthProvider';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { EnergyCore } from '@shared/ui/EnergyCore';
import { RankChip } from '@shared/ui/RankChip';
import { RankFrame } from '@shared/ui/RankFrame';
import { StatCard, formatStatNumber } from '@shared/ui/StatCard';
import { useProfileDetail } from './profileApi';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super-Admin',
  admin: 'Admin',
  leader: 'Leader',
  berater: 'Berater',
};

/**
 * Eigenes Profil: Identität, Rang/AP, geschäftlicher Kontext.
 * Shared UI only — keine Animation, kein ProgressRing, kein Hero.
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
  // Anzeige aus aktiver Mitgliedschaft — profiles.role ist nur Spiegel.
  const roleLabel = ROLE_LABELS[membershipRole ?? ''] ?? membershipRole ?? '—';

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Profil</h1>

      <Card className="flex flex-col items-center gap-4 text-center">
        <RankFrame
          frameKey={rank.current?.frame_asset ?? null}
          src={profile.avatar_url}
          name={displayName || profile.username}
          size="lg"
        />
        <div>
          <p className="text-xl font-semibold">{displayName}</p>
          <p className="text-sm text-muted">@{profile.username}</p>
        </div>
        {currentLabel ? (
          <RankChip
            label={currentLabel}
            frameKey={rank.current?.frame_asset ?? null}
            variant="framed"
          />
        ) : null}
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
        <StatCard label="Rolle" value={roleLabel} />
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
