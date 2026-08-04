import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';
import type { DailyPlanItem } from '@shared/types/domain';
import { localDate } from '../dailyPlanApi';
import { buildCloseSnapshot, buildOpenSnapshot } from './buildCloseSnapshot';
import {
  readDayClose,
  readDayOpen,
  writeDayClose,
  writeDayOpen,
} from './dayMemoryStore';
import type { DayCloseRecord, DayCloseSource, DayOpenRecord } from './types';

/**
 * Day Memory hook — Closing Loop persistence for Today.
 * IDB is source of truth for close state; usage_events insert is best-effort.
 */
export function useDayMemory() {
  const { profile, membership } = useAuth();
  const userId = profile?.id;
  const planDate = localDate();
  const [close, setClose] = useState<DayCloseRecord | null>(null);
  const [open, setOpen] = useState<DayOpenRecord | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) {
      setClose(null);
      setOpen(null);
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    void Promise.all([readDayClose(userId, planDate), readDayOpen(userId, planDate)]).then(
      ([c, o]) => {
        if (cancelled) return;
        setClose(c);
        setOpen(o);
        setReady(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [userId, planDate]);

  const markDayOpened = useCallback(
    async (items: DailyPlanItem[]) => {
      if (!userId) return;
      const existing = await readDayOpen(userId, planDate);
      if (existing) {
        setOpen(existing);
        return existing;
      }
      const record = buildOpenSnapshot({ userId, planDate, items });
      await writeDayOpen(record);
      setOpen(record);
      return record;
    },
    [userId, planDate]
  );

  const closeDay = useCallback(
    async (items: DailyPlanItem[], source: DayCloseSource) => {
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
    isClosed: Boolean(close),
    markDayOpened,
    closeDay,
  };
}
