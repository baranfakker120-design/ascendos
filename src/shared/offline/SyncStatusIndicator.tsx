import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@shared/i18n';
import { isOnline, subscribeNetwork } from './networkStatus';
import { pendingSyncCount, subscribeSyncQueue, flushSyncQueue } from './syncQueue';
import { pendingUploadCount, subscribeUploadQueue, flushUploadQueue } from './uploadQueue';
import './sync-status.css';

export type SyncUiState = 'offline' | 'syncing' | 'pending' | 'synced';

type Props = {
  /** Compact home labels: Synced / Syncing / Offline / Pending */
  variant?: 'header' | 'home';
};

async function computeState(
  online: boolean,
  syncing: boolean
): Promise<{
  state: SyncUiState;
  pending: number;
}> {
  const [syncN, upN] = await Promise.all([pendingSyncCount(), pendingUploadCount()]);
  const pending = syncN + upN;
  if (!online) return { state: 'offline', pending };
  if (syncing) return { state: 'syncing', pending };
  if (pending > 0) return { state: 'pending', pending };
  return { state: 'synced', pending: 0 };
}

/**
 * Tiny non-intrusive sync chip — no popups, no layout redesign.
 */
export function SyncStatusIndicator({ variant = 'header' }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<SyncUiState>(isOnline() ? 'synced' : 'offline');
  const [pending, setPending] = useState(0);
  const syncingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = (isSyncing = syncingRef.current) => {
      void computeState(isOnline(), isSyncing).then((next) => {
        if (cancelled) return;
        setState(next.state);
        setPending(next.pending);
      });
    };
    refresh();
    const unsubs = [
      subscribeNetwork((online) => {
        if (online) {
          syncingRef.current = true;
          refresh(true);
          void (async () => {
            try {
              await flushSyncQueue();
              await flushUploadQueue();
            } finally {
              syncingRef.current = false;
              refresh(false);
            }
          })();
        } else {
          refresh(false);
        }
      }),
      subscribeSyncQueue(() => refresh()),
      subscribeUploadQueue(() => refresh()),
    ];
    const interval = window.setInterval(() => refresh(), 8_000);
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
      window.clearInterval(interval);
    };
  }, []);

  const label =
    variant === 'home'
      ? state === 'offline'
        ? t('sync.homeOffline')
        : state === 'syncing'
          ? t('sync.homeSyncing')
          : state === 'pending'
            ? t('sync.homePending')
            : t('sync.homeSynced')
      : state === 'offline'
        ? pending > 0
          ? t('sync.offlinePending', { count: pending })
          : t('sync.offline')
        : state === 'syncing'
          ? t('sync.syncing')
          : state === 'pending'
            ? t('sync.pendingUploads', { count: pending })
            : t('sync.cloudSynced');

  return (
    <div
      className={`sync-status sync-status--${state}${variant === 'home' ? ' sync-status--home' : ''}`}
      role="status"
      aria-live="polite"
      title={label}
    >
      <span className="sync-status__dot" aria-hidden />
      <span className="sync-status__label">{label}</span>
    </div>
  );
}
