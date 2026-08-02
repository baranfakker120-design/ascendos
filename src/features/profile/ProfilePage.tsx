import { Link } from 'react-router-dom';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { RankFrame } from '@shared/ui/RankFrame';
import { useProfileDetail } from './profileApi';
import { RankSummary } from './RankSummary';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super-Admin',
  admin: 'Admin',
  leader: 'Leader',
  berater: 'Berater',
};

/**
 * Eigenes Profil: Identität, Rang/AP, geschäftlicher Kontext.
 * Keine Animation, kein Hero, keine Sammlung.
 */
export function ProfilePage() {
  const { data, isLoading, isError } = useProfileDetail();

  if (isLoading) {
    return <p className="text-sm text-muted">Profil wird geladen …</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-muted">Profil konnte nicht geladen werden.</p>;
  }

  const { profile, context, rank } = data;
  const displayName = `${profile.first_name} ${profile.last_name}`.trim();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold">Profil</h1>
        <Link
          to="/profil/bearbeiten"
          className="text-sm font-semibold text-accent-deep hover:underline"
        >
          Bearbeiten
        </Link>
      </div>

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
      </Card>

      <Card>
        <RankSummary apTotal={rank.apTotal} current={rank.current} next={rank.next} />
      </Card>

      <Card>
        <p className="font-semibold">Geschäftskontext</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Rolle</dt>
            <dd className="font-medium">{ROLE_LABELS[profile.role] ?? profile.role}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Team</dt>
            <dd className="font-medium">{context.teamName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Organisation</dt>
            <dd className="font-medium">{context.orgName}</dd>
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
