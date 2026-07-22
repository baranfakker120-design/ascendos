import { Card } from '@shared/ui/Card';
import { DayReview } from './components/DayReview';
import { FocusMode } from './components/FocusMode';
import { MorningCommit } from './components/MorningCommit';
import { useDailyPlan, useDailyPlanMutations } from './dailyPlanApi';
import { missionProgress, orderMissions } from './missionOrder';

/**
 * Daily Command Center (Sprint 3): drei Zustände als abgeleiteter
 * State aus den Daten — kein separater Client-Zustand, der driften
 * könnte. Vollständig ohne LLM funktionsfähig (ADR-006-Fallback
 * ist hier der Normalfall; Begründungen kommen aus der Regel-Engine).
 */
export function TodayPage() {
  const { data, isLoading, isError } = useDailyPlan();
  const { commitPlan, setMissionStatus } = useDailyPlanMutations();

  if (isLoading) {
    return <p className="text-sm text-muted">Dein Tag wird vorbereitet …</p>;
  }
  if (isError || !data) {
    return (
      <Card>
        <p className="font-medium">Dein Plan konnte nicht geladen werden.</p>
        <p className="mt-1 text-sm text-muted">
          Prüfe deine Verbindung und öffne den Tab erneut — dein Plan wartet in der Datenbank.
        </p>
      </Card>
    );
  }

  const ordered = orderMissions(data.items);
  const progress = missionProgress(data.items);

  // Zustand 1: Morgen-Commit — Plan steht, noch nicht bestätigt.
  if (!data.plan.committed_at) {
    return (
      <MorningCommit
        items={data.items}
        busy={commitPlan.isPending}
        onCommit={() => void commitPlan.mutateAsync(data.plan.id)}
      />
    );
  }

  // Zustand 3: Tagesabschluss — nichts wartet mehr.
  if (ordered.dayComplete) {
    return <DayReview items={data.items} />;
  }

  // Zustand 2: Fokus-Modus.
  return (
    <FocusMode
      ordered={ordered}
      progress={progress}
      onStatus={(itemId, status, reason) =>
        void setMissionStatus.mutateAsync({ itemId, status, reason })
      }
    />
  );
}
