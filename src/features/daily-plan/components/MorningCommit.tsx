import { useAuth } from '@shared/auth/AuthProvider';
import type { DailyPlanItem } from '@shared/types/domain';
import { Button } from '@shared/ui/Button';
import { Card } from '@shared/ui/Card';
import { MISSION_ICONS } from './missionMeta';

/**
 * Der Morgen-Moment (Phase 3): kompletter Plan sichtbar, ein Commit.
 * Die KI/Engine erklärt zu jeder Mission das Warum.
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
        {items.map((item, index) => (
          <li key={item.id}>
            <Card className="flex gap-3">
              <span aria-hidden className="text-xl leading-none">
                {MISSION_ICONS[item.mission_type]}
              </span>
              <div className="min-w-0">
                <p className="font-semibold">
                  {index + 1}. {item.title}
                </p>
                <p className="mt-0.5 text-sm text-muted">{item.reason}</p>
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <Button onClick={onCommit} disabled={busy}>
        {busy ? 'Einen Moment …' : '🚀 Ich fokussiere mich auf heute'}
      </Button>
    </div>
  );
}
