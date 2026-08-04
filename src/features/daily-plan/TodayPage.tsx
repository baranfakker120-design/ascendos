import { useMemo, useState } from 'react';
import { SyncStatusIndicator } from '@shared/offline';
import { useI18n } from '@shared/i18n';
import { Card } from '@shared/ui/Card';
import { TodayCeoBriefingSlot, TodayCoachOsSlot } from '@features/coach/executive';
import { useCoachOrgIntelligence } from '@features/coach/intelligence';
import { TodayLiveCoachingSlot } from '@features/live-coaching/TodayLiveCoachingSlot';
import { TodayStoriesSlot } from '@features/stories/TodayStoriesSlot';
import { ClosedDay, ClosingLoop } from './components/ClosingLoop';
import { DecisionDiff } from './components/DecisionDiff';
import { FocusMode } from './components/FocusMode';
import { MorningCommit } from './components/MorningCommit';
import { buildDecisionDiff, useDayMemory } from './dayMemory';
import { useDailyPlan, useDailyPlanMutations } from './dailyPlanApi';
import { missionProgress, orderMissions, pinPriority } from './missionOrder';
import '@features/coach/executive/executive.css';

/**
 * Daily Command Center — Sprint 5 home stack:
 * Stories → Live Coaching → sync → Day Memory / Mission → CEO Briefing → Coach.
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
  const memory = useDayMemory();
  const { intelligence } = useCoachOrgIntelligence(true);
  const [manualClose, setManualClose] = useState(false);
  const [closingBusy, setClosingBusy] = useState(false);

  const diffLines = useMemo(() => {
    if (!data || data.plan.committed_at) return [];
    return buildDecisionDiff({
      yesterdayClose: memory.yesterdayClose,
      todayItems: data.items,
      warnings: (intelligence?.managerMessages ?? []).slice(0, 3).map((m) => ({
        kind: m.id,
        title: m.text,
        name: m.text,
        action: m.why,
      })),
      followUps: (intelligence?.followUps ?? []).map((f) => ({
        contactId: f.contactId,
        name: f.name,
        heat: f.heat,
        why: f.why,
      })),
    });
  }, [data, memory.yesterdayClose, intelligence]);

  if (isPending || !memory.ready) {
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

  const ordered = pinPriority(orderMissions(data.items), memory.open?.priorityItemId);
  const progress = missionProgress(data.items);

  if (memory.close) {
    return (
      <ClosedDay
        outcome={memory.close.outcome}
        missionsDone={memory.close.missionsDone}
        missionsTotal={memory.close.missionsTotal}
        tomorrowSeed={memory.close.tomorrowSeed}
      />
    );
  }

  if (!data.plan.committed_at) {
    if (data.items.length === 0) {
      return (
        <div className="space-y-4">
          {diffLines.length > 0 ? <DecisionDiff lines={diffLines} /> : null}
          <Card>
            <p className="font-medium">{t('today.empty')}</p>
            <p className="mt-1 text-sm text-muted">{t('today.emptyHint')}</p>
          </Card>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {diffLines.length > 0 ? <DecisionDiff lines={diffLines} /> : null}
        <MorningCommit
          items={data.items}
          busy={commitPlan.isPending}
          onCommit={(priority) => {
            void (async () => {
              await memory.markDayOpened(data.items, priority);
              await commitPlan.mutateAsync(data.plan.id);
            })();
          }}
        />
      </div>
    );
  }

  const dayComplete = ordered.dayComplete || data.items.length === 0 || !ordered.current;
  const showClosing = dayComplete || manualClose;

  if (showClosing) {
    return (
      <ClosingLoop
        items={data.items}
        busy={closingBusy}
        sourceHint={manualClose && !dayComplete ? 'manual_close' : 'missions_complete'}
        onKeepWorking={manualClose && !dayComplete ? () => setManualClose(false) : undefined}
        onClose={() => {
          void (async () => {
            setClosingBusy(true);
            try {
              await memory.closeDay(
                data.items,
                manualClose && !dayComplete ? 'manual_close' : 'missions_complete'
              );
            } finally {
              setClosingBusy(false);
            }
          })();
        }}
      />
    );
  }

  return (
    <FocusMode
      ordered={ordered}
      progress={progress}
      busy={setMissionStatus.isPending}
      onStatus={(itemId, status, reason) =>
        void setMissionStatus.mutateAsync({ itemId, status, reason })
      }
      onEndDay={() => setManualClose(true)}
    />
  );
}
