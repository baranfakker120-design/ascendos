import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { SyncStatusIndicator } from '@shared/offline';
import { useI18n } from '@shared/i18n';
import { Card } from '@shared/ui/Card';
import { TodayCeoBriefingSlot, TodayCoachOsSlot } from '@features/coach/executive';
import { useCoachOrgIntelligence } from '@features/coach/intelligence';
import { useContacts } from '@features/contacts/contactsApi';
import { TodayLiveCoachingSlot } from '@features/live-coaching/TodayLiveCoachingSlot';
import { TodayStoriesSlot } from '@features/stories/TodayStoriesSlot';
import { ClosedDay, ClosingLoop, EveningCloseReminder } from './components/ClosingLoop';
import { DecisionDiff } from './components/DecisionDiff';
import { FocusMode } from './components/FocusMode';
import { MorningCommit } from './components/MorningCommit';
import { buildDecisionDiff, isEveningCloseWindow, useDayMemory } from './dayMemory';
import { useDailyPlan, useDailyPlanMutations } from './dailyPlanApi';
import { missionProgress, orderMissions, pinPriority } from './missionOrder';
import '@features/coach/executive/executive.css';

/**
 * Daily Command Center — Sprint 5 home stack:
 * Stories → Live Coaching → sync → Day Memory / Mission → CEO Briefing → Coach surface.
 */
export function TodayPage() {
  const { t } = useI18n();
  const { hash } = useLocation();
  const memory = useDayMemory();

  const dayContext = useMemo(
    () => ({
      priorityTitle: memory.open?.priorityTitle ?? memory.close?.priorityTitle ?? null,
      isClosed: Boolean(memory.close),
      tomorrowSeed: memory.close?.tomorrowSeed ?? [],
      diffTitles: memory.yesterdayClose?.tomorrowSeed ?? [],
    }),
    [memory.open, memory.close, memory.yesterdayClose]
  );

  useEffect(() => {
    const id = hash.replace(/^#/, '');
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  return (
    <div className="space-y-4">
      <TodayStoriesSlot />
      <TodayLiveCoachingSlot />
      <div className="exec-home-sync">
        <SyncStatusIndicator variant="home" />
      </div>
      <section
        id="heute-tagesplan"
        className="exec-mission scroll-mt-4"
        aria-label={t('today.missionTitle')}
      >
        <p className="exec-mission__label">{t('today.missionTitle')}</p>
        <div id="heute-aufgaben" className="scroll-mt-4">
          <TodayDailyPlan memory={memory} />
        </div>
      </section>
      <div id="heute-prioritaeten" className="scroll-mt-4">
        <TodayCeoBriefingSlot />
      </div>
      <TodayCoachOsSlot dayContext={dayContext} />
    </div>
  );
}

function TodayDailyPlan({ memory }: { memory: ReturnType<typeof useDayMemory> }) {
  const { t } = useI18n();
  const { data, isPending, isError } = useDailyPlan();
  const { commitPlan, setMissionStatus } = useDailyPlanMutations();
  const { intelligence } = useCoachOrgIntelligence(true);
  const contacts = useContacts({ limit: 100 });
  const [manualClose, setManualClose] = useState(false);
  const [closeSource, setCloseSource] = useState<'manual_close' | 'evening_reminder'>(
    'manual_close'
  );
  const [closingBusy, setClosingBusy] = useState(false);
  const evening = isEveningCloseWindow();

  const lastEventByContactId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const c of contacts.data?.items ?? []) {
      map.set(c.id, c.last_event_at);
    }
    return map;
  }, [contacts.data?.items]);

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
    return <ClosedDay record={memory.close} />;
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
          lastEventByContactId={lastEventByContactId}
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
        openRecord={memory.open}
        busy={closingBusy}
        sourceHint={dayComplete ? 'missions_complete' : closeSource}
        onKeepWorking={
          !dayComplete
            ? () => {
                setManualClose(false);
              }
            : undefined
        }
        onSave={(journal) => {
          void (async () => {
            setClosingBusy(true);
            try {
              await memory.closeDay(
                data.items,
                dayComplete ? 'missions_complete' : closeSource,
                journal
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
    <div className="space-y-4">
      {evening ? (
        <EveningCloseReminder
          onEndDay={() => {
            setCloseSource('evening_reminder');
            setManualClose(true);
          }}
        />
      ) : null}
      <FocusMode
        ordered={ordered}
        progress={progress}
        busy={setMissionStatus.isPending}
        lastEventByContactId={lastEventByContactId}
        onStatus={(itemId, status, reason) =>
          void setMissionStatus.mutateAsync({ itemId, status, reason })
        }
        onEndDay={() => {
          setCloseSource('manual_close');
          setManualClose(true);
        }}
      />
    </div>
  );
}
