import { Link } from 'react-router-dom';
import { comboBonusAp, scoreDailyMission } from '@shared/lib/apScoring';
import type { DailyPlanItem } from '@shared/types/domain';
import { ApRewardSticker } from '@shared/ui/ApRewardSticker';
import { Card } from '@shared/ui/Card';

/**
 * Tagesabschluss (Phase 3): kurzes Review mit verdienten AP-Stickern.
 */
export function DayReview({ items }: { items: DailyPlanItem[] }) {
  const done = items.filter((i) => i.status === 'done');
  const skipped = items.filter((i) => i.status === 'skipped');
  const combo = comboBonusAp(done.length);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tag abgeschlossen. Stark.</h1>
          <p className="mt-1 text-sm text-muted">
            {done.length === items.length
              ? 'Alle Missionen erledigt — konsequenter geht es nicht.'
              : `${done.length} von ${items.length} Missionen erledigt.`}
          </p>
        </div>
        {combo > 0 ? <ApRewardSticker ap={combo} size="sm" mark="⚡" animate={false} /> : null}
      </div>

      <Card className="space-y-2.5">
        {done.map((i) => (
          <div key={i.id} className="flex items-center gap-2 text-sm">
            <span aria-hidden>✓</span>
            <span className="min-w-0 flex-1 text-muted line-through">{i.title}</span>
            <ApRewardSticker
              ap={scoreDailyMission(i.mission_type, { engineScore: i.score })}
              size="sm"
              animate={false}
            />
          </div>
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
