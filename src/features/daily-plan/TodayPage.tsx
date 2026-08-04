import { SyncStatusIndicator } from '@shared/offline';
import { useI18n } from '@shared/i18n';
import { Card } from '@shared/ui/Card';
import { TodayCeoBriefingSlot, TodayCoachOsSlot } from '@features/coach/executive';
import { TodayLiveCoachingSlot } from '@features/live-coaching/TodayLiveCoachingSlot';
import { TodayStoriesSlot } from '@features/stories/TodayStoriesSlot';
import { DayReview } from './components/DayReview';
import { FocusMode } from './components/FocusMode';
import { MorningCommit } from './components/MorningCommit';
import { useDailyPlan, useDailyPlanMutations } from './dailyPlanApi';
import { missionProgress, orderMissions } from './missionOrder';
import '@features/coach/executive/executive.css';

/**
 * Daily Command Center — executive home stack (additive):
 * Stories → Live Coaching → sync chip → Mission → CEO Briefing → Coach.
 */
export function TodayPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <TodayStoriesSlot />
      <TodayLiveCoachingSlot />
      <div className="exec-home-sync">
        <SyncStatusIndicator variant="home" />
      </div>
      <section className="exec-mission" aria-label={t('today.missionTitle')}>
        <p className="exec-mission__label">{t('today.missionTitle')}</p>
        <TodayDailyPlan />
      </section>
      <TodayCeoBriefingSlot />
      <TodayCoachOsSlot />
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

  if (ordered.dayComplete || data.items.length === 0) {
    return <DayReview items={data.items} />;
  }

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
