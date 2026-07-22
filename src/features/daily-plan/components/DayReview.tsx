import { Link } from 'react-router-dom';
import type { DailyPlanItem } from '@shared/types/domain';
import { Card } from '@shared/ui/Card';

/**
 * Tagesabschluss (Phase 3): kurzes Review, echte Zahlen, keine
 * Casino-Mechanik. Verschobene/übersprungene Missionen fließen
 * morgen als Signale wieder in die Regel-Engine ein.
 */
export function DayReview({ items }: { items: DailyPlanItem[] }) {
  const done = items.filter((i) => i.status === 'done');
  const skipped = items.filter((i) => i.status === 'skipped');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Tag abgeschlossen. Stark.</h1>
        <p className="mt-1 text-sm text-muted">
          {done.length === items.length
            ? 'Alle Missionen erledigt — konsequenter geht es nicht.'
            : `${done.length} von ${items.length} Missionen erledigt.`}
        </p>
      </div>

      <Card className="space-y-2">
        {done.map((i) => (
          <p key={i.id} className="text-sm">
            ✓ <span className="text-muted line-through">{i.title}</span>
          </p>
        ))}
        {skipped.map((i) => (
          <p key={i.id} className="text-sm text-muted">
            – {i.title}
            {i.status_reason ? ` (${i.status_reason})` : ''} — fließt morgen neu in die Planung ein.
          </p>
        ))}
      </Card>

      <Card>
        <p className="text-sm font-medium">Noch Energie übrig?</p>
        <p className="mt-1 text-sm text-muted">
          Ein Blick in deine{' '}
          <Link to="/kontakte" className="font-medium text-primary">
            Pipeline
          </Link>{' '}
          lohnt immer — oder genieß den Feierabend. Morgen früh steht dein neuer Plan bereit.
        </p>
      </Card>
    </div>
  );
}
