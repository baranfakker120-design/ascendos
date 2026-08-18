import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import type { DailyPlanItem } from '@shared/types/domain';
import { localDate } from '../dailyPlanApi';
import { buildCloseSnapshot, buildOpenSnapshot } from './buildCloseSnapshot';
import {
  readDayClose,
  readDayOpen,
  readYesterdayClose,
  writeDayClose,
  writeDayOpen,
} from './dayMemoryStore';
import type { DayCloseJournal, DayCloseRecord, DayCloseSource, DayOpenRecord } from './types';

/**
 * Day Memory hook — Closing Loop persistence for Today.
 * IDB is source of truth; usage_events insert is best-effort analytics only.
 */
export function useDayMemory() {
  const { profile, membership } = useAuth();
  const userId = profile?.id;
  const planDate = localDate();
  const [close, setClose] = useState<DayCloseRecord | null>(null);
  const [open, setOpen] = useState<DayOpenRecord | null>(null);
  const [yesterdayClose, setYesterdayClose] = useState<DayCloseRecord | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) {
      setClose(null);
      setOpen(null);
      setYesterdayClose(null);
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    void Promise.all([
      readDayClose(userId, planDate),
      readDayOpen(userId, planDate),
      readYesterdayClose(userId, planDate),
    ]).then(([c, o, y]) => {
      if (cancelled) return;
      setClose(c);
      setOpen(o);
      setYesterdayClose(y);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, planDate]);

  const markDayOpened = useCallback(
    async (items: DailyPlanItem[], priority?: DailyPlanItem | null) => {
      if (!userId) return;
      const existing = await readDayOpen(userId, planDate);
      if (existing && !priority) {
        setOpen(existing);
        return existing;
      }
      const record = buildOpenSnapshot({ userId, planDate, items, priority });
      await writeDayOpen(record);
      setOpen(record);
      return record;
    },
    [userId, planDate]
  );

  const closeDay = useCallback(
    async (items: DailyPlanItem[], source: DayCloseSource, journal: DayCloseJournal) => {
      if (!userId) return null;
      const existing = await readDayClose(userId, planDate);
      if (existing) {
        setClose(existing);
        return existing;
      }
      const openRec = open ?? (await readDayOpen(userId, planDate));
      const record = buildCloseSnapshot({
        userId,
        planDate,
        items,
        source,
        open: openRec,
        journal,
      });
      await writeDayClose(record);
      setClose(record);

      const orgId = membership?.org_id ?? profile?.org_id;
      if (orgId) {
        void supabase
          .from('usage_events')
          .insert({
            user_id: userId,
            org_id: orgId,
            event_type: 'day_closed',
            metadata: {
              plan_date: planDate,
              outcome: record.outcome,
              source: record.source,
              missions_done: record.missionsDone,
              missions_total: record.missionsTotal,
              evidence_count: record.evidence.length,
              has_tomorrow_note: Boolean(record.tomorrowNote),
            },
          })
          .then(
            () => undefined,
            () => undefined
          );
      }
      return record;
    },
    [userId, planDate, open, membership?.org_id, profile?.org_id]
  );

  return {
    ready,
    planDate,
    close,
    open,
    yesterdayClose,
    isClosed: Boolean(close),
    markDayOpened,
    closeDay,
  };
}
