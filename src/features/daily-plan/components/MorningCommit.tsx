import { useAuth } from '@shared/auth/AuthProvider';
import { scoreDailyMission } from '@shared/lib/apScoring';
import type { DailyPlanItem } from '@shared/types/domain';
import { ApRewardSticker } from '@shared/ui/ApRewardSticker';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { MISSION_ICONS } from './missionMeta';

/**
 * Der Morgen-Moment (Phase 3): kompletter Plan sichtbar, ein Commit.
 * Jede Mission zeigt ihren automatisch berechneten AP-Reward.
 */
export function MorningCommit({
  items,
  onCommit,
  busy,
}: {
  items: DailyPlanItem[];
  onCommit: () => void;
  busy: boolean;
}) {
  const { profile } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
  const count = items.length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">
          {greeting}
          {profile ? `, ${profile.first_name}` : ''}.
        </h1>
        <p className="mt-1 text-sm text-muted">
          {count === 1
            ? 'Heute gibt es eine Aufgabe mit der größten Auswirkung auf dein Business.'
            : `Heute gibt es ${count} Aufgaben mit der größten Auswirkung auf dein Business.`}
        </p>
      </div>

      <ol className="space-y-2">
        {items.map((item, index) => {
          const ap = scoreDailyMission(item.mission_type, {
            engineScore: item.score,
          });
          return (
            <li key={item.id}>
              <Card className="flex gap-3" padding="sm">
                <span aria-hidden className="text-xl leading-none">
                  {MISSION_ICONS[item.mission_type]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">
                      {index + 1}. {item.title}
                    </p>
                    <ApRewardSticker ap={ap} size="sm" animate={false} />
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{item.reason}</p>
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      <Button onClick={onCommit} disabled={busy}>
        {busy ? 'Einen Moment …' : '🚀 Ich fokussiere mich auf heute'}
      </Button>
    </div>
  );
}
