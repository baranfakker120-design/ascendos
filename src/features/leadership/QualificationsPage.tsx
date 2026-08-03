import { useQualificationProgress } from './leadershipApi';
import { TeamLeaderProgressCard } from './components/TeamLeaderProgressCard';
import './components/leader-surface.css';

export function QualificationsPage() {
  const { data, isPending, isError, refetch } = useQualificationProgress();

  if (isPending) {
    return <p className="text-sm text-muted">Qualifikationen werden geladen …</p>;
  }
  if (isError || !data) {
    return (
      <div className="space-y-2">
        <p className="font-medium">Qualifikationen konnten nicht geladen werden.</p>
        <button type="button" className="text-sm underline" onClick={() => void refetch()}>
          Erneut versuchen
        </button>
      </div>
    );
  }

  const tl = data.teamLeader;
  const nextPct =
    data.nextRank && data.nextRank.thresholdAp > 0
      ? Math.min(100, Math.round((data.apTotal / data.nextRank.thresholdAp) * 100))
      : 100;

  return (
    <div className="leader-qual space-y-3">
      <header>
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-accent-deep">
          Qualifikationen
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Dein Rangpfad</h1>
      </header>

      <section className="leader-glass leader-qual__card">
        <p className="leader-dash__label">Aktueller Rang</p>
        <p className="text-xl font-bold">{data.currentRank?.label ?? 'Newcomer'}</p>
        <p className="text-sm text-muted">{data.apTotal.toLocaleString('de-DE')} AP</p>
      </section>

      {data.nextRank ? (
        <section className="leader-glass leader-qual__card">
          <p className="leader-dash__label">Nächster Rang</p>
          <p className="text-lg font-bold">{data.nextRank.label}</p>
          <p className="text-sm text-muted">
            Noch {data.nextRank.remainingAp.toLocaleString('de-DE')} AP
          </p>
          <div className="leader-tl__bar mt-3" role="progressbar" aria-valuenow={nextPct}>
            <span style={{ width: `${nextPct}%` }} />
          </div>
        </section>
      ) : null}

      <TeamLeaderProgressCard
        progress={{
          membershipId: data.membershipId,
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
        {data.unlockedRewards.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Auszahlungsansprüche.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {data.unlockedRewards.map((r) => (
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
