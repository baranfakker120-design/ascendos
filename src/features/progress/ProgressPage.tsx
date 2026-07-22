import { Card } from '@shared/ui/Card';
import { useProgression } from './progressApi';

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Deine Business-Reise (Sprint 5): sichtbarer echter Fortschritt.
 * Rollierendes Wochenfenster statt Streak (kein Bestrafen), Meilensteine
 * statt Punkte — Philosophie aus Phase 3.
 */
export function ProgressPage() {
  const { data, isLoading } = useProgression();

  if (isLoading || !data) {
    return <p className="text-sm text-muted">Deine Reise wird geladen …</p>;
  }

  const unlocked = data.achievements.filter((a) => data.unlockedById.has(a.id));
  const locked = data.achievements.filter((a) => !data.unlockedById.has(a.id));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Deine Reise</h1>

      <Card className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xl font-bold">{data.weeklyActiveDays}/7</p>
          <p className="text-xs text-muted">Tagen diese Woche aktiv</p>
        </div>
        <div>
          <p className="text-xl font-bold">{data.contactsTotal}</p>
          <p className="text-xs text-muted">Kontakte aufgebaut</p>
        </div>
        <div>
          <p className="text-xl font-bold">{data.followUpsTotal}</p>
          <p className="text-xs text-muted">Follow-ups dokumentiert</p>
        </div>
      </Card>

      {unlocked.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Erreichte Meilensteine
          </h2>
          {unlocked.map((a) => (
            <Card key={a.id} className="flex items-center gap-3 border-accent/40">
              <span aria-hidden className="text-2xl">{a.icon}</span>
              <div className="min-w-0">
                <p className="font-semibold">{a.title}</p>
                <p className="text-sm text-muted">{a.description}</p>
                <p className="mt-0.5 text-xs text-muted">
                  Erreicht am {dateFmt.format(new Date(data.unlockedById.get(a.id)!))}
                </p>
              </div>
            </Card>
          ))}
        </section>
      ) : null}

      {locked.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Vor dir liegt
          </h2>
          {locked.map((a) => (
            <Card key={a.id} className="flex items-center gap-3 opacity-55">
              <span aria-hidden className="text-2xl grayscale">{a.icon}</span>
              <div className="min-w-0">
                <p className="font-semibold">{a.title}</p>
                <p className="text-sm text-muted">{a.description}</p>
              </div>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}
