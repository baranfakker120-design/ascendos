import { useI18n } from '@shared/i18n';
import { Card } from '@shared/ui/Card';
import { TodayLiveCoachingSlot } from '@features/live-coaching/TodayLiveCoachingSlot';
import { TodayStoriesSlot } from '@features/stories/TodayStoriesSlot';
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
 *
 * Sprint 5.1: Live Coaching card is an additive sibling above the plan.
 * Sprint 5.2: Ascend Stories bar above coaching (additive).
 */
export function TodayPage() {
  return (
    <div className="space-y-4">
      <TodayStoriesSlot />
      <TodayLiveCoachingSlot />
      <TodayDailyPlan />
    </div>
  );
}

function TodayDailyPlan() {
  const { t } = useI18n();
  const { data, isPending, isError } = useDailyPlan();
  const { commitPlan, setMissionStatus } = useDailyPlanMutations();

  if (isPending) {
    return <p className="text-sm text-muted">{t('today.loading')}</p>;
  }
  if (isError || !data) {
    return (
      <Card>
        <p className="font-medium">{t('today.loadErrorTitle')}</p>
        <p className="mt-1 text-sm text-muted">{t('today.loadErrorHint')}</p>
      </Card>
    );
  }

  const ordered = orderMissions(data.items);
  const progress = missionProgress(data.items);

  // Zustand 1: Morgen-Commit — Plan steht, noch nicht bestätigt.
  if (!data.plan.committed_at) {
    if (data.items.length === 0) {
      return (
        <Card>
          <p className="font-medium">{t('today.empty')}</p>
          <p className="mt-1 text-sm text-muted">{t('today.emptyHint')}</p>
        </Card>
      );
    }
    return (
      <MorningCommit
        items={data.items}
        busy={commitPlan.isPending}
        onCommit={() => void commitPlan.mutateAsync(data.plan.id)}
      />
    );
  }

  // Zustand 3: Tagesabschluss — nichts wartet mehr.
  if (ordered.dayComplete || data.items.length === 0) {
    return <DayReview items={data.items} />;
  }

  // Zustand 2: Fokus-Modus — nur wenn es eine aktuelle Mission gibt.
  if (!ordered.current) {
    return <DayReview items={data.items} />;
  }

  return (
    <FocusMode
      ordered={ordered}
      progress={progress}
      busy={setMissionStatus.isPending}
      onStatus={(itemId, status, reason) =>
        void setMissionStatus.mutateAsync({ itemId, status, reason })
      }
    />
  );
}
