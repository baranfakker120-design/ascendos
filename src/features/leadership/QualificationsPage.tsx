import { Link } from 'react-router-dom';
import { isMissingRpcError } from '@shared/api/rpcErrors';
import { buttonClassName } from '@shared/ui/Button';
import { useQualificationProgress } from './leadershipApi';
import { TeamLeaderProgressCard } from './components/TeamLeaderProgressCard';
import './components/leader-surface.css';

export function QualificationsPage() {
  const { data, isPending, isError, error, refetch } = useQualificationProgress();

  if (isPending) {
    return <p className="text-sm text-muted">Qualifikationen werden geladen …</p>;
  }

  if (isError) {
    const schemaGap = isMissingRpcError(error);
    return (
      <div className="space-y-3 text-center">
        <p className="font-medium">
          {schemaGap
            ? 'Qualifikationen sind noch nicht auf der Datenbank freigeschaltet.'
            : 'Qualifikationen konnten nicht geladen werden.'}
        </p>
        <p className="text-sm text-muted">
          {schemaGap
            ? 'Bitte setup/production-migrations-26-27.sql im Supabase SQL Editor ausführen.'
            : 'Prüfe deine Verbindung und versuche es erneut.'}
        </p>
        <button type="button" className="text-sm underline" onClick={() => void refetch()}>
          Erneut versuchen
        </button>
      </div>
    );
  }

  // data is always defined on success (fallback fills gaps)
  const progress = data!;
  const tl = progress.teamLeader;
  const noPartnersYet = tl.activeFirstlines === 0 && !tl.qualified;
  const nextPct =
    progress.nextRank && progress.nextRank.thresholdAp > 0
      ? Math.min(100, Math.round((progress.apTotal / progress.nextRank.thresholdAp) * 100))
      : 100;

  return (
    <div className="leader-qual space-y-3">
      <header>
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-accent-deep">
          Qualifikationen
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Dein Rangpfad</h1>
      </header>

      {noPartnersYet ? (
        <section className="leader-glass leader-qual__card space-y-3 text-center">
          <p className="text-lg font-bold tracking-tight">Starte mit deinem ersten Partner</p>
          <p className="text-sm text-muted">
            Du hast aktuell noch keine Teammitglieder. Sobald du deinen ersten Businesspartner
            registrierst, erscheint dein Team- und Qualifikationsfortschritt hier.
          </p>
          <Link to="/more" className={buttonClassName({ fullWidth: false })}>
            ➕ Ersten Partner gewinnen
          </Link>
        </section>
      ) : null}

      <section className="leader-glass leader-qual__card">
        <p className="leader-dash__label">Aktueller Rang</p>
        <p className="text-xl font-bold">{progress.currentRank?.label ?? 'Newcomer'}</p>
        <p className="text-sm text-muted">{progress.apTotal.toLocaleString('de-DE')} AP</p>
      </section>

      {progress.nextRank ? (
        <section className="leader-glass leader-qual__card">
          <p className="leader-dash__label">Nächster Rang</p>
          <p className="text-lg font-bold">{progress.nextRank.label}</p>
          <p className="text-sm text-muted">
            Noch {progress.nextRank.remainingAp.toLocaleString('de-DE')} AP
          </p>
          <div className="leader-tl__bar mt-3" role="progressbar" aria-valuenow={nextPct}>
            <span style={{ width: `${nextPct}%` }} />
          </div>
        </section>
      ) : null}

      <TeamLeaderProgressCard
        progress={{
          membershipId: progress.membershipId,
          activeFirstlines: tl.activeFirstlines,
          requiredFirstlines: tl.requiredFirstlines,
          qualified: tl.qualified,
          qualifiedAt: tl.qualifiedAt,
          bonusEntitled: tl.qualified,
          bonusPaid: tl.bonusPaid,
          bonusAmountCents: tl.bonusAmountCents,
        }}
      />

      <section className="leader-glass leader-qual__card">
        <p className="leader-dash__label">Freigeschaltete Belohnungen</p>
        {progress.unlockedRewards.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Auszahlungsansprüche.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {progress.unlockedRewards.map((r) => (
              <li key={`${r.kind}-${r.amountCents}`} className="flex justify-between gap-2">
                <span>{r.note ?? r.kind}</span>
                <span className="font-semibold">
                  {(r.amountCents / 100).toLocaleString('de-DE', {
                    style: 'currency',
                    currency: 'EUR',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
